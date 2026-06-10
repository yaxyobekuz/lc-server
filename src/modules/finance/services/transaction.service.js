import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import ApiError from "../../../utils/ApiError.js";
import {
  parseLocalDay,
  localTodayMidnight,
  dateKeyOf,
} from "../../../helpers/attendance.helper.js";
import * as studentPaymentService from "./studentPayment.service.js";
import * as groupFeeService from "./groupFee.service.js";

const nextMonth = (year, month) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

// Eng ko'pi bilan necha oy oldinga avans taqsimlanadi (cheksiz loop qo'riqlovi)
const MAX_ADVANCE_MONTHS = 24;

// To'lov qabul qiladi. Summa joriy oy qoldig'idan oshsa, ortig'i ketma-ket
// keyingi oylarga (avans) taqsimlanadi - har oyga alohida tranzaksiya yoziladi.
// Shunda kirim har oyga taqsimlangan holda hisoblanadi.
export const create = async ({ paymentId, amount, method, paidAt, note }, currentUser) => {
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");

  const membership = payment.membership
    ? await GroupMembership.findById(payment.membership)
    : null;
  const canSpill = !!membership && !membership.leftAt;
  const baseNote = note || "";

  const created = [];
  let leftover = amount;
  let cursor = { year: payment.year, month: payment.month };
  let current = payment;
  let isFirst = true;
  let steps = 0;

  while (leftover > 0 && steps < MAX_ADVANCE_MONTHS) {
    steps += 1;

    if (!current) {
      await groupFeeService.ensureGroupFee(payment.group, cursor.year, cursor.month);
      current = await studentPaymentService.ensurePaymentForMembership(
        membership,
        cursor.year,
        cursor.month,
      );
    }

    const remaining = Math.max(
      0,
      (current?.expectedAmount || 0) - (current?.paidAmount || 0),
    );
    const alloc = Math.min(leftover, remaining);

    if (alloc > 0) {
      // Avans (kelgusi oy) tranzaksiyasi o'sha oyning 1-sanasiga yoziladi -
      // kirim shu oyga tegishli bo'lib hisoblanadi; haqiqiy sana note'da qoladi.
      const trxPaidAt = isFirst
        ? day
        : new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
      const trxNote = isFirst ? baseNote : `${baseNote ? baseNote + " · " : ""}Avans (${dateKeyOf(day)})`;

      const trx = await PaymentTransaction.create({
        payment: current._id,
        student: current.student,
        group: current.group,
        year: current.year,
        month: current.month,
        amount: alloc,
        method,
        paidAt: trxPaidAt,
        note: trxNote,
        createdBy: currentUser?._id || null,
      });
      created.push(trx);
      await studentPaymentService.recalcStatus(current._id);
      leftover -= alloc;
    }

    if (leftover <= 0) break;
    if (!canSpill) break;

    cursor = nextMonth(cursor.year, cursor.month);
    current = null;
    isFirst = false;
  }

  // Hali ham ortiqcha qolsa (spill imkoni yo'q yoki cap) - joriy oyga ortiqcha sifatida
  if (leftover > 0) {
    const trx = await PaymentTransaction.create({
      payment: payment._id,
      student: payment.student,
      group: payment.group,
      year: payment.year,
      month: payment.month,
      amount: leftover,
      method,
      paidAt: day,
      note: baseNote,
      createdBy: currentUser?._id || null,
    });
    created.push(trx);
    await studentPaymentService.recalcStatus(payment._id);
  }

  return { allocated: created.length, transactions: created };
};

// Tranzaksiyani bekor qiladi (soft-delete), statusni qayta hisoblaydi.
export const remove = async (id, currentUser) => {
  const trx = await PaymentTransaction.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!trx) throw new ApiError(404, "Tranzaksiya topilmadi");
  await trx.softDelete(currentUser?._id);
  await studentPaymentService.recalcStatus(trx.payment);
  return { _id: id };
};
