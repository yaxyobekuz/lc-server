import mongoose from "mongoose";
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
import { runFinanceTxn } from "./financeTxn.helper.js";

// Idempotentlik dublikati - takror so'rovni "yangi pul emas" deb qaytaradi.
const duplicateResult = (existing) => ({
  allocated: 0,
  duplicate: true,
  transactions: existing ? [existing] : [],
});

const nextMonth = (year, month) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

// Eng ko'pi bilan necha oy oldinga avans taqsimlanadi (cheksiz loop qo'riqlovi)
const MAX_ADVANCE_MONTHS = 24;

// To'lov qabul qiladi. Summa joriy oy qoldig'idan oshsa, ortig'i ketma-ket
// keyingi oylarga (avans) taqsimlanadi - har oyga alohida tranzaksiya yoziladi.
// Shunda kirim har oyga taqsimlangan holda hisoblanadi.
// idempotencyKey berilsa: bir xil kalitli takror so'rov (double-click/retry)
// yangi pul yozmaydi - mavjud tranzaksiya qaytariladi.
export const create = async (
  { paymentId, amount, method, paidAt, note, idempotencyKey },
  currentUser,
) => {
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");
  // Kelajak sanaga kirim yozib bo'lmaydi (kassa kunlik hisobi buzilmasin)
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "To'lov sanasi kelajakda bo'lishi mumkin emas");
  }

  if (idempotencyKey) {
    const existing = await PaymentTransaction.findOne({ idempotencyKey });
    if (existing) return duplicateResult(existing);
  }

  // Spill (avans) joriy a'zolikka bog'liq - uning _id'si loop ichida har safar
  // YANGI holatda (leftAt) qayta o'qiladi (#3A stale membership tuzatildi).
  const membership = payment.membership
    ? await GroupMembership.findById(payment.membership)
    : null;

  const baseNote = note || "";

  // BUTUN to'lov (joriy oy + barcha avans bo'laklari) bitta MongoDB tranzaksiyasida
  // bajariladi. Yarmida xato bo'lsa HAMMASI rollback - "yarim yozilgan to'lov"
  // (pul yo'qolishi yoki fantom paidAmount) bo'lmaydi (#2A, batch atomiklik).
  try {
    return await runFinanceTxn(async (session) => {
      // Tranzaksiya ichida payment'ni qayta o'qiymiz (eng yangi paidAmount/leftAt).
      const root = await StudentPayment.findById(paymentId).session(session || null);
      if (!root) throw new ApiError(404, "To'lov topilmadi");

      const created = [];
      // Bitta so'rovdagi barcha bo'laklar (avans oylari) shu ID bilan bog'lanadi.
      const batchId = new mongoose.Types.ObjectId();
      let leftover = amount;
      let cursor = { year: root.year, month: root.month };
      let current = root;
      let isFirst = true;
      let steps = 0;

      while (leftover > 0 && steps < MAX_ADVANCE_MONTHS) {
        steps += 1;

        if (!current) {
          await groupFeeService.ensureGroupFee(root.group, cursor.year, cursor.month, {
            session,
          });
          current = await studentPaymentService.ensurePaymentForMembership(
            membership,
            cursor.year,
            cursor.month,
            { session },
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
          const trxNote = isFirst
            ? baseNote
            : `${baseNote ? baseNote + " · " : ""}Avans (${dateKeyOf(day)})`;

          const [trx] = await PaymentTransaction.create(
            [
              {
                payment: current._id,
                student: current.student,
                group: current.group,
                year: current.year,
                month: current.month,
                amount: alloc,
                method,
                paidAt: trxPaidAt,
                note: trxNote,
                // Kalit faqat batch'ning birinchi yozuviga - unique index dublikatni to'sadi
                idempotencyKey: created.length === 0 ? idempotencyKey || null : null,
                batchId,
                createdBy: currentUser?._id || null,
              },
            ],
            { session: session || undefined },
          );
          created.push(trx);
          // Yangi paidAmount'ni qaytarib olamiz - keyingi iteratsiya stale o'qimasin.
          current = await studentPaymentService.applyPaidDelta(current._id, alloc, {
            session,
          });
          leftover -= alloc;
        }

        if (leftover <= 0) break;

        // SPILL qarori HAR iteratsiyada YANGI o'qilgan membership holatiga tayanadi -
        // bir marta olingan stale snapshot'ga emas (#3A). O'quvchi to'lov davomida
        // guruhdan chiqsa (leftAt), keyingi oylarga fantom to'lov yozilmaydi.
        const live = membership
          ? await GroupMembership.findById(membership._id).session(session || null)
          : null;
        const canSpill = !!live && !live.leftAt && !live.isDeleted;
        if (!canSpill) break;

        cursor = nextMonth(cursor.year, cursor.month);
        current = null;
        isFirst = false;
      }

      // Hali ortiqcha qolsa (spill imkoni yo'q yoki cap) - joriy oyga ortiqcha sifatida.
      if (leftover > 0) {
        const [trx] = await PaymentTransaction.create(
          [
            {
              payment: root._id,
              student: root.student,
              group: root.group,
              year: root.year,
              month: root.month,
              amount: leftover,
              method,
              paidAt: day,
              note: baseNote,
              idempotencyKey: created.length === 0 ? idempotencyKey || null : null,
              batchId,
              createdBy: currentUser?._id || null,
            },
          ],
          { session: session || undefined },
        );
        created.push(trx);
        await studentPaymentService.applyPaidDelta(root._id, leftover, { session });
      }

      return { allocated: created.length, transactions: created };
    });
  } catch (err) {
    // Parallel takror so'rov unique idempotency indexga urildi (tranzaksiya abort
    // bo'ldi) - dublikat yozmaymiz, mavjud tranzaksiyani qaytaramiz.
    if (err?.code === 11000 && idempotencyKey) {
      const existing = await PaymentTransaction.findOne({ idempotencyKey });
      if (existing) return duplicateResult(existing);
    }
    throw err;
  }
};

// Tranzaksiyani bekor qiladi (soft-delete), balansni atomik kamaytiradi.
// Avansli to'lov (batch) bo'lsa - BUTUN batch birga void bo'ladi: bitta bo'lakni
// o'chirib kelgusi oylarda "fantom avans" qoldirib bo'lmaydi.
//
// BUTUN void (softDelete + har bo'lak uchun paidAmount qaytarish) bitta MongoDB
// tranzaksiyasida bajariladi. Aks holda yarmida xato bo'lsa: tranzaksiya o'chirilgan
// bo'lib (isDeleted=true), lekin paidAmount qaytarilmay qolardi - kassadan pul
// chiqqani holda yozuv "to'langan" ko'rinib, audit izsiz pul yo'qolardi (#1A, #1B).
export const remove = async (id, currentUser) => {
  return runFinanceTxn(async (session) => {
    const trx = await PaymentTransaction.findOne({
      _id: id,
      isDeleted: { $ne: true },
    }).session(session || null);
    if (!trx) throw new ApiError(404, "Tranzaksiya topilmadi");

    const batch = trx.batchId
      ? await PaymentTransaction.find({
          batchId: trx.batchId,
          isDeleted: { $ne: true },
        }).session(session || null)
      : [trx];

    const removed = [];
    for (const t of batch) {
      t.isDeleted = true;
      t.deletedAt = new Date();
      t.deletedBy = currentUser?._id || null;
      await t.save({ session: session || undefined });
      await studentPaymentService.applyPaidDelta(t.payment, -t.amount, { session });
      removed.push(t._id);
    }
    return { _id: id, removed };
  });
};
