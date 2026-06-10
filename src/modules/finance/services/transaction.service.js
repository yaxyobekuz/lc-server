import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import ApiError from "../../../utils/ApiError.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as studentPaymentService from "./studentPayment.service.js";

// Qisman to'lov qo'shadi (naqd/karta), so'ng oylik to'lov statusini yangilaydi.
export const create = async ({ paymentId, amount, method, paidAt, note }, currentUser) => {
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");

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
    createdBy: currentUser?._id || null,
  });

  await studentPaymentService.recalcStatus(payment._id);
  return trx;
};

// Tranzaksiyani bekor qiladi (soft-delete), statusni qayta hisoblaydi.
export const remove = async (id, currentUser) => {
  const trx = await PaymentTransaction.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!trx) throw new ApiError(404, "Tranzaksiya topilmadi");
  await trx.softDelete(currentUser?._id);
  await studentPaymentService.recalcStatus(trx.payment);
  return { _id: id };
};
