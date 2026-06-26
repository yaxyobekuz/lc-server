import mongoose from "mongoose";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as studentPaymentService from "./studentPayment.service.js";
import * as depositService from "../../deposits/services/deposit.service.js";
import { runFinanceTxn } from "./financeTxn.helper.js";

// Bir martada qabul qilinadigan maksimal summa (kassa xatosini cheklash uchun).
const MAX_PAYMENT_AMOUNT = 50_000_000;

// Idempotentlik dublikati - takror so'rovni "yangi pul emas" deb qaytaradi.
const duplicateResult = (existing) => ({
  allocated: 0,
  duplicate: true,
  transactions: existing ? [existing] : [],
});

// To'lovni taqsimlash tartibi: avval TANLANGAN oy, keyin shu o'quvchining shu
// guruhdagi boshqa qoldiq oylari (ENG ESKISIDAN). Tanlangan oy to'liq to'langan
// bo'lsa ham ro'yxatda qoladi (loop ichida 0 ulush bilan o'tib ketiladi).
const buildAllocationOrder = async (selected) => {
  const others = await StudentPayment.find({
    student: selected.student,
    group: selected.group,
    _id: { $ne: selected._id },
    isDeleted: { $ne: true },
    $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
  }).sort({ year: 1, month: 1, createdAt: 1 });
  return [selected, ...others];
};

// To'lov qabul qiladi. Tanlangan oydan ortgan summa avtomatik ravishda shu
// o'quvchining keyingi qoldiq oylariga (eng eskisidan) DIRECT tranzaksiya bo'lib
// taqsimlanadi - har oy uchun alohida yozuv, bitta batchId bilan (bekor qilishda
// birga void). Barcha qarz yopilgach ortgan pul GAROV sifatida depozitga tushadi.
// Cheklov shartli-atomik update bilan (parallel double-click capdan o'tmaydi);
// idempotencyKey berilsa takror so'rov yangi pul yozmaydi.
export const create = async (
  { paymentId, amount, method, paidAt, note, idempotencyKey },
  currentUser,
) => {
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  // Arxivlangan guruhga to'lov qabul qilinmaydi (avval arxivdan chiqarish kerak).
  assertGroupActive(
    await Group.findById(payment.group, { isActive: 1, isDeleted: 1 }),
  );

  const total = Number(amount);
  if (!Number.isFinite(total) || total <= 0) {
    throw new ApiError(400, "Summa noto'g'ri");
  }
  if (total > MAX_PAYMENT_AMOUNT) {
    throw new ApiError(400, "Bir martada 50 000 000 so'mdan ko'p kiritib bo'lmaydi");
  }

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

  const order = await buildAllocationOrder(payment);
  const batchId = new mongoose.Types.ObjectId();
  const transactions = [];
  let left = total;
  // Idempotency kaliti faqat BATCH'ning birinchi yozuviga biriktiriladi.
  let pendingKey = idempotencyKey || null;

  for (const plan of order) {
    if (left <= 0) break;
    const remaining = Math.max(0, (plan.expectedAmount || 0) - (plan.paidAmount || 0));
    const take = Math.min(left, remaining);
    if (take <= 0) continue;

    // Avval balans atomik oshiriladi (cap sharti bilan), keyin tranzaksiya yoziladi.
    const updated = await studentPaymentService.applyPaidDelta(plan._id, take, {
      capToRemaining: true,
    });
    // null → parallel so'rov shu oyni allaqachon yopgan; keyingi oyga o'tamiz
    // (qolgan pul oxirida depozitga tushadi, autoApply qoldig'ini qoplaydi).
    if (!updated) continue;

    try {
      const trx = await PaymentTransaction.create({
        payment: plan._id,
        student: plan.student,
        group: plan.group,
        year: plan.year,
        month: plan.month,
        amount: take,
        source: "direct",
        method,
        paidAt: day,
        note: note || "",
        idempotencyKey: pendingKey,
        batchId,
        createdBy: currentUser?._id || null,
      });
      transactions.push(trx);
      pendingKey = null;
      left -= take;
    } catch (err) {
      // Tranzaksiya yozilmasa - balans oshirilgancha qolmasin (rollback).
      await studentPaymentService.applyPaidDelta(plan._id, -take);
      // Parallel takror so'rov unique idempotency indexga urildi - dublikatni qaytaramiz.
      if (err?.code === 11000 && idempotencyKey) {
        const existing = await PaymentTransaction.findOne({ idempotencyKey });
        if (existing) return duplicateResult(existing);
      }
      throw err;
    }
  }

  // Barcha qarzdan ortgan summa GAROV bo'lib depozitga tushadi (topup → autoApply
  // boshqa guruhlardagi qoldiqni ham eng eskisidan qoplaydi, qolgani balansda qoladi).
  let depositCredited = 0;
  if (left > 0) {
    await depositService.topup(
      payment.student,
      { amount: left, method, paidAt, note: note || "Ortiqcha to'lov - garovga" },
      currentUser,
    );
    depositCredited = left;
  }

  return { allocated: transactions.length, transactions, depositCredited };
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
      // Depozitdan qoplangan to'lov bekor qilinsa - pul DEPOZITGA qaytadi (naqdga emas).
      // Refund void bilan bir xil tranzaksiyada - tashqi abort'da double-credit bo'lmasin.
      if (t.source === "deposit") {
        await depositService.refundToDeposit(t.student, t.amount, { session });
      }
      removed.push(t._id);
    }
    return { _id: id, removed };
  });
};
