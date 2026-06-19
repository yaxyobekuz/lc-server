import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as studentPaymentService from "./studentPayment.service.js";
import { runFinanceTxn } from "./financeTxn.helper.js";

// Idempotentlik dublikati - takror so'rovni "yangi pul emas" deb qaytaradi.
const duplicateResult = (existing) => ({
  allocated: 0,
  duplicate: true,
  transactions: existing ? [existing] : [],
});

// To'lov qabul qiladi. Faqat shu oylik PLAN qoldig'igacha (expected - paid) -
// plan bo'yicha ORTIQCHA to'lov yoki keyingi oylarga avans QILIB BO'LMAYDI.
// Cheklov shartli-atomik update bilan tekshiriladi (parallel double-click ham
// capdan o'tmaydi). idempotencyKey berilsa: takror so'rov yangi pul yozmaydi.
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

  // Avval balans atomik oshiriladi (cap sharti bilan), keyin tranzaksiya yoziladi.
  const updated = await studentPaymentService.applyPaidDelta(payment._id, amount, {
    capToRemaining: true,
  });
  if (!updated) {
    if (idempotencyKey) {
      const existing = await PaymentTransaction.findOne({ idempotencyKey });
      if (existing) return duplicateResult(existing);
    }
    const remaining = Math.max(0, (payment.expectedAmount || 0) - (payment.paidAmount || 0));
    throw new ApiError(400, `To'lov plan qoldig'idan oshib ketadi (qoldiq: ${remaining} so'm)`);
  }

  try {
    const trx = await PaymentTransaction.create({
      payment: payment._id,
      student: payment.student,
      group: payment.group,
      year: payment.year,
      month: payment.month,
      amount,
      method,
      paidAt: day,
      note: note || "",
      idempotencyKey: idempotencyKey || null,
      createdBy: currentUser?._id || null,
    });
    return { allocated: 1, transactions: [trx] };
  } catch (err) {
    // Tranzaksiya yozilmasa - balans oshirilgancha qolmasin (rollback).
    await studentPaymentService.applyPaidDelta(payment._id, -amount);
    // Parallel takror so'rov unique idempotency indexga urildi - dublikatni qaytaramiz.
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
