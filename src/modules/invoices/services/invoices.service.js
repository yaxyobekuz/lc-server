import mongoose from "mongoose";
import Invoice from "../../../models/invoice.model.js";
import Payment from "../../../models/payment.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  computeDiscountAmount,
  computeDueDate,
} from "../../../helpers/billing.helper.js";
import { get as getSettings } from "../../paymentSettings/services/paymentSettings.service.js";

const NON_CANCELLED = { $ne: "cancelled" };

const ensurePeriod = ({ year, month }) => {
  if (!year || !month || month < 1 || month > 12) {
    throw new ApiError(400, "Davr noto'g'ri");
  }
};

const startOfMonth = (year, month) =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
const endOfMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

export const ensureInvoiceFor = async (
  studentId,
  groupId,
  membershipId,
  { year, month },
  { createdBy = null } = {},
) => {
  ensurePeriod({ year, month });

  const existing = await Invoice.findOne({
    student: studentId,
    group: groupId,
    "period.year": year,
    "period.month": month,
    status: NON_CANCELLED,
  });
  if (existing) return existing;

  const group = await Group.findById(groupId);
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  const baseAmount = Number(group.monthlyPrice) || 0;
  const { amount: discountAmount, snapshot } = await computeDiscountAmount(
    studentId,
    baseAmount,
  );
  const totalDue = Math.max(0, baseAmount - discountAmount);

  const settings = await getSettings();
  const dueDate = computeDueDate({ year, month }, settings.dueDayOfMonth);

  try {
    return await Invoice.create({
      student: studentId,
      group: groupId,
      membership: membershipId || null,
      period: { year, month },
      baseAmount,
      discountAmount,
      discountSnapshot: snapshot,
      totalDue,
      paidAmount: 0,
      status: "unpaid",
      dueDate,
      createdBy,
    });
  } catch (e) {
    // E11000 - boshqa ishlovchi yaratib ulgurgan
    if (e.code === 11000) {
      return Invoice.findOne({
        student: studentId,
        group: groupId,
        "period.year": year,
        "period.month": month,
        status: NON_CANCELLED,
      });
    }
    throw e;
  }
};

export const generateForPeriod = async ({ year, month }, { createdBy = null } = {}) => {
  ensurePeriod({ year, month });

  // Active membership: leftAt === null (yoki shu oy tugagandan keyin)
  // Talaba 25-noyabrda qo'shilsa ham, dekabr uchun invoice yaratiladi (next-month).
  // Joriy oy uchun: faqat oy oxirigacha active bo'lganlar.
  const periodEnd = endOfMonth(year, month);
  const memberships = await GroupMembership.find({
    $or: [{ leftAt: null }, { leftAt: { $gt: periodEnd } }],
    joinedAt: { $lte: periodEnd },
  }).populate({
    path: "group",
    match: { isActive: true },
  });

  let created = 0;
  let skipped = 0;
  for (const m of memberships) {
    if (!m.group) continue;
    const before = await Invoice.findOne({
      student: m.student,
      group: m.group._id,
      "period.year": year,
      "period.month": month,
      status: NON_CANCELLED,
    });
    if (before) {
      skipped += 1;
      continue;
    }
    await ensureInvoiceFor(m.student, m.group._id, m._id, { year, month }, { createdBy });
    created += 1;
  }

  return { created, skipped, total: memberships.length };
};

const STUDENT_PROJECTION = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
  parentPhone: 1,
};
const GROUP_PROJECTION = { name: 1, monthlyPrice: 1, schedule: 1 };

export const list = async ({
  studentId,
  groupId,
  year,
  month,
  status,
  page = 1,
  limit = 20,
}) => {
  const filter = {};
  if (studentId) filter.student = studentId;
  if (groupId) filter.group = groupId;
  if (year) filter["period.year"] = Number(year);
  if (month) filter["period.month"] = Number(month);
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ "period.year": -1, "period.month": -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("student", STUDENT_PROJECTION)
      .populate("group", GROUP_PROJECTION),
    Invoice.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export const getById = async (id) => {
  const invoice = await Invoice.findById(id)
    .populate("student", STUDENT_PROJECTION)
    .populate("group", GROUP_PROJECTION)
    .populate("createdBy", { firstName: 1, lastName: 1 })
    .populate("cancelledBy", { firstName: 1, lastName: 1 });
  if (!invoice) throw new ApiError(404, "Hisob topilmadi");

  const payments = await Payment.find({ invoice: invoice._id })
    .sort({ paidAt: -1, createdAt: -1 })
    .populate("method", { name: 1, code: 1, isActive: 1 })
    .populate("receivedBy", { firstName: 1, lastName: 1 });

  return { ...invoice.toJSON(), payments };
};

const computeStatus = (totalDue, paidAmount) => {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount < totalDue) return "partial";
  return "paid";
};

export const recompute = async (invoiceId, session = null) => {
  const opts = session ? { session } : {};
  const invoice = await Invoice.findById(invoiceId, null, opts);
  if (!invoice) throw new ApiError(404, "Hisob topilmadi");
  if (invoice.status === "cancelled") return invoice;

  const groups = await Payment.aggregate([
    { $match: { invoice: invoice._id } },
    { $group: { _id: "$type", sum: { $sum: "$amount" } } },
  ]).session(session || null);

  let paid = 0;
  let refunded = 0;
  for (const g of groups) {
    if (g._id === "payment") paid = g.sum;
    if (g._id === "refund") refunded = g.sum;
  }
  const net = Math.max(0, paid - refunded);

  invoice.paidAmount = net;
  invoice.status = computeStatus(invoice.totalDue, net);
  await invoice.save(opts);
  return invoice;
};

export const computeNetPaid = async (invoiceId, session = null) => {
  const groups = await Payment.aggregate([
    { $match: { invoice: new mongoose.Types.ObjectId(String(invoiceId)) } },
    { $group: { _id: "$type", sum: { $sum: "$amount" } } },
  ]).session(session || null);

  let paid = 0;
  let refunded = 0;
  for (const g of groups) {
    if (g._id === "payment") paid = g.sum;
    if (g._id === "refund") refunded = g.sum;
  }
  return Math.max(0, paid - refunded);
};

export const create = async (body, currentUser) => {
  ensurePeriod(body.period);

  const student = await User.findById(body.student);
  if (!student || student.role !== ROLES.STUDENT) {
    throw new ApiError(400, "Talaba topilmadi");
  }
  const group = await Group.findById(body.group);
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  const exists = await Invoice.findOne({
    student: body.student,
    group: body.group,
    "period.year": body.period.year,
    "period.month": body.period.month,
    status: NON_CANCELLED,
  });
  if (exists) throw new ApiError(409, "Bu davr uchun hisob mavjud");

  const baseAmount = body.baseAmount ?? (Number(group.monthlyPrice) || 0);
  let discountAmount = 0;
  let snapshot = [];
  if (body.discountAmount !== undefined && body.discountAmount !== null) {
    discountAmount = Math.max(0, Math.min(baseAmount, Number(body.discountAmount)));
  } else {
    const auto = await computeDiscountAmount(body.student, baseAmount);
    discountAmount = auto.amount;
    snapshot = auto.snapshot;
  }
  const totalDue = Math.max(0, baseAmount - discountAmount);

  const settings = await getSettings();
  const dueDate = body.dueDate
    ? new Date(body.dueDate)
    : computeDueDate(body.period, settings.dueDayOfMonth);

  return Invoice.create({
    student: body.student,
    group: body.group,
    membership: body.membership || null,
    period: body.period,
    baseAmount,
    discountAmount,
    discountSnapshot: snapshot,
    totalDue,
    status: "unpaid",
    dueDate,
    createdBy: currentUser?._id || null,
    notes: body.notes || "",
  });
};

export const update = async (id, body) => {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new ApiError(404, "Hisob topilmadi");
  if (invoice.status === "cancelled") {
    throw new ApiError(400, "Bekor qilingan hisobni tahrirlab bo'lmaydi");
  }

  if (body.notes !== undefined) invoice.notes = body.notes;

  if (body.discountAmount !== undefined) {
    const v = Math.max(0, Math.min(invoice.baseAmount, Number(body.discountAmount)));
    invoice.discountAmount = v;
    invoice.totalDue = Math.max(0, invoice.baseAmount - v);
    // paidAmount'ni HAQIQIY to'lov yozuvlaridan qayta hisoblaymiz —
    // stale paidAmount bilan status sakrab ketmasligi uchun
    const realPaid = await computeNetPaid(invoice._id);
    invoice.paidAmount = realPaid;
    invoice.status = computeStatus(invoice.totalDue, realPaid);
  }
  if (body.dueDate !== undefined) {
    invoice.dueDate = new Date(body.dueDate);
  }

  await invoice.save();
  return invoice;
};

export const cancel = async (id, { reason = "" } = {}, currentUser) => {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw new ApiError(404, "Hisob topilmadi");
  if (invoice.status === "cancelled") return invoice;

  if (!String(reason || "").trim()) {
    throw new ApiError(400, "Bekor qilish sababi majburiy");
  }

  invoice.status = "cancelled";
  invoice.cancelledAt = new Date();
  invoice.cancelledReason = reason;
  invoice.cancelledBy = currentUser?._id || null;
  // Bekor qilingan hisob to'lovlar hisobotlarida hisoblanmasligi uchun
  // paidAmount nolga keltiriladi (mavjud Payment yozuvlari saqlanadi
  // audit uchun, lekin reports/dashboard bu hisobni filtrlaydi).
  invoice.paidAmount = 0;
  await invoice.save();
  return invoice;
};
