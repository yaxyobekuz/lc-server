import mongoose from "mongoose";
import Payment from "../../../models/payment.model.js";
import Invoice from "../../../models/invoice.model.js";
import PaymentMethod from "../../../models/paymentMethod.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import {
  recompute as recomputeInvoice,
  computeNetPaid,
} from "../../invoices/services/invoices.service.js";
import { get as getSettings } from "../../paymentSettings/services/paymentSettings.service.js";
import { ensureActiveGroup } from "../../../helpers/membership.helper.js";

const STUDENT_PROJECTION = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
};
const GROUP_PROJECTION = { name: 1, monthlyPrice: 1 };

const ensureMethod = async (methodId) => {
  const m = await PaymentMethod.findById(methodId);
  if (!m) throw new ApiError(400, "To'lov usuli topilmadi");
  return m;
};

export const list = async ({
  studentId,
  invoiceId,
  methodId,
  fromDate,
  toDate,
  type,
  page = 1,
  limit = 20,
}) => {
  const filter = {};
  if (studentId) filter.student = studentId;
  if (invoiceId) filter.invoice = invoiceId;
  if (methodId) filter.method = methodId;
  if (type) filter.type = type;
  if (fromDate || toDate) {
    filter.paidAt = {};
    if (fromDate) filter.paidAt.$gte = new Date(fromDate);
    if (toDate) filter.paidAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Payment.find(filter)
      .sort({ paidAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("method", { name: 1, code: 1, isActive: 1 })
      .populate("receivedBy", { firstName: 1, lastName: 1 })
      .populate("student", STUDENT_PROJECTION)
      .populate({
        path: "invoice",
        select: { period: 1, totalDue: 1, group: 1, status: 1 },
        populate: { path: "group", select: GROUP_PROJECTION },
      }),
    Payment.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export const getById = async (id) => {
  const payment = await Payment.findById(id)
    .populate("method")
    .populate("receivedBy", { firstName: 1, lastName: 1 })
    .populate("student", STUDENT_PROJECTION)
    .populate({
      path: "invoice",
      populate: { path: "group", select: GROUP_PROJECTION },
    });
  if (!payment) throw new ApiError(404, "To'lov topilmadi");
  return payment;
};

const runWithSession = async (fn) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    session.endSession();
    return result;
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        /* noop */
      }
      session.endSession();
    }
    // Standalone Mongo'da transactionlar ishlamaydi → sequential fallback
    if (
      err?.code === 20 ||
      err?.codeName === "IllegalOperation" ||
      err?.message?.includes("Transaction") ||
      err?.message?.includes("replica set")
    ) {
      return fn(null);
    }
    throw err;
  }
};

export const record = async (
  { invoiceId, amount, methodId, paidAt, note },
  currentUser,
) => {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new ApiError(400, "Summa noto'g'ri");
  if (!Number.isInteger(amt)) throw new ApiError(400, "Summa butun son bo'lishi kerak");

  return runWithSession(async (session) => {
    const opts = session ? { session } : {};
    const invoice = await Invoice.findById(invoiceId, null, opts);
    if (!invoice) throw new ApiError(404, "Hisob topilmadi");
    if (invoice.status === "cancelled") {
      throw new ApiError(400, "Bekor qilingan hisobga to'lov yozib bo'lmaydi");
    }

    // Faqat faol guruhdagi o'quvchiga to'lov yozish mumkin
    await ensureActiveGroup(invoice.student, session);

    await ensureMethod(methodId);

    // Qarzdan ortiq summa o'quvchi balansiga o'tadi. To'lov yozuvi to'liq
    // summada saqlanadi (audit + kunlik hisobot), hisob paidAmount esa
    // recompute'da totalDue bilan cheklanadi.
    const netPaid = await computeNetPaid(invoice._id, session);
    const remaining = Math.max(
      0,
      invoice.totalDue - netPaid - (invoice.appliedBalance || 0),
    );
    const overflow = Math.max(0, amt - remaining);

    const created = await Payment.create(
      [
        {
          invoice: invoice._id,
          student: invoice.student,
          amount: amt,
          type: "payment",
          method: methodId,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          receivedBy: currentUser._id,
          note: note || "",
        },
      ],
      session ? { session } : undefined,
    );

    await recomputeInvoice(invoice._id, session);

    // Qarzdan ortiq summa — balansga (keyingi oy hisobidan yechiladi)
    if (overflow > 0) {
      const student = await User.findById(invoice.student, null, opts);
      if (student) {
        student.balance = (Number(student.balance) || 0) + overflow;
        await student.save(opts);
      }
    }

    return created[0];
  });
};

export const refund = async (paymentId, { amount, reason }, currentUser) => {
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new ApiError(400, "Summa noto'g'ri");
  if (!Number.isInteger(amt)) throw new ApiError(400, "Summa butun son bo'lishi kerak");
  if (!String(reason || "").trim()) {
    throw new ApiError(400, "Qaytarish sababi majburiy");
  }

  return runWithSession(async (session) => {
    const opts = session ? { session } : {};
    const original = await Payment.findById(paymentId, null, opts);
    if (!original) throw new ApiError(404, "To'lov topilmadi");
    if (original.type !== "payment") {
      throw new ApiError(400, "Faqat oddiy to'lovni qaytarish mumkin");
    }

    const netPaid = await computeNetPaid(original.invoice, session);
    if (amt > netPaid) {
      throw new ApiError(400, "Refund summasi qolgan to'lovdan oshmasin");
    }

    const created = await Payment.create(
      [
        {
          invoice: original.invoice,
          student: original.student,
          amount: amt,
          type: "refund",
          method: original.method,
          paidAt: new Date(),
          receivedBy: currentUser._id,
          refundOf: original._id,
          refundReason: reason || "",
        },
      ],
      session ? { session } : undefined,
    );

    await recomputeInvoice(original.invoice, session);
    return created[0];
  });
};

export const buildReceipt = async (paymentId) => {
  const payment = await getById(paymentId);
  const settings = await getSettings();
  return {
    centerName: settings.centerName,
    payment,
    invoice: payment.invoice,
    student: payment.student,
    group: payment.invoice?.group || null,
    receivedBy: payment.receivedBy,
    netPaid: await computeNetPaid(payment.invoice?._id),
  };
};

// O'quvchi bo'yicha to'lov xulosasi (userProfile.helper.js + bot foydalanadi)
export const getStudentSummary = async (studentId) => {
  const sid = new mongoose.Types.ObjectId(String(studentId));

  const [paid, refunded, openInvoices, lastPayment, student] =
    await Promise.all([
      Payment.aggregate([
        { $match: { student: sid, type: "payment" } },
        { $group: { _id: null, sum: { $sum: "$amount" } } },
      ]),
      Payment.aggregate([
        { $match: { student: sid, type: "refund" } },
        { $group: { _id: null, sum: { $sum: "$amount" } } },
      ]),
      Invoice.find({
        student: sid,
        status: { $in: ["unpaid", "partial"] },
      })
        .sort({ "period.year": 1, "period.month": 1 })
        .select({ totalDue: 1, paidAmount: 1, period: 1 }),
      Payment.findOne({ student: sid, type: "payment" })
        .sort({ paidAt: -1 })
        .select({ paidAt: 1 }),
      User.findById(sid).select({ balance: 1 }),
    ]);

  const totalPaid = (paid[0]?.sum || 0) - (refunded[0]?.sum || 0);
  const currentDebt = openInvoices.reduce(
    (acc, inv) => acc + Math.max(0, inv.totalDue - inv.paidAmount),
    0,
  );
  const oldestUnpaidPeriod = openInvoices[0]?.period || null;

  return {
    totalPaid,
    currentDebt,
    balance: Number(student?.balance) || 0,
    lastPaymentAt: lastPayment?.paidAt || null,
    oldestUnpaidPeriod,
    openInvoicesCount: openInvoices.length,
  };
};
