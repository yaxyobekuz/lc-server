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
  proratedBase,
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

// Yangi hisobni o'quvchi balansidan to'ldiradi (yetganicha; chala bo'lsa qisman).
// Function declaration — hoisting tufayli ensureInvoiceFor ichidan chaqiriladi.
async function applyStudentBalance(invoice) {
  if (!invoice || invoice.totalDue <= 0) return invoice;

  const student = await User.findById(invoice.student);
  const balance = Number(student?.balance) || 0;
  if (!student || balance <= 0) return invoice;

  const apply = Math.min(balance, invoice.totalDue);
  if (apply <= 0) return invoice;

  invoice.appliedBalance = apply;
  invoice.paidAmount = apply;
  invoice.status = apply >= invoice.totalDue ? "paid" : "partial";
  await invoice.save();

  student.balance = balance - apply;
  await student.save();
  return invoice;
}

export const ensureInvoiceFor = async (
  studentId,
  groupId,
  membershipId,
  { year, month },
  { createdBy = null, effectiveEnd = null } = {},
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

  // effectiveEnd berilsa (o'quvchi oy o'rtasida chiqdi/arxivlandi) — o'qigan qismiga prorate
  const baseAmount = effectiveEnd
    ? proratedBase(group, { year, month }, effectiveEnd)
    : Number(group.monthlyPrice) || 0;
  const { amount: discountAmount, snapshot } = await computeDiscountAmount(
    studentId,
    baseAmount,
    undefined,
    groupId,
  );
  const totalDue = Math.max(0, baseAmount - discountAmount);

  const settings = await getSettings();
  const dueDate = computeDueDate({ year, month }, settings.dueDayOfMonth);

  try {
    const invoice = await Invoice.create({
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
    // Yangi hisob: o'quvchi balansidan avtomatik yechib qo'yamiz
    await applyStudentBalance(invoice);
    return invoice;
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

  // Shu oyda faol bo'lgan a'zoliklar: oy oxirigacha qo'shilgan VA oy boshidan keyin chiqqan (yoki hali chiqmagan).
  // leftAt oy ichida bo'lsa — o'qigan qismiga prorate (qarz). Arxivlangan (isActive=false) o'quvchi o'tkazib yuboriladi
  // (uning yakuniy hisobi arxivlash paytida reconcileOnLeave bilan yoziladi).
  const monthStart = startOfMonth(year, month);
  const periodEnd = endOfMonth(year, month);
  const memberships = await GroupMembership.find({
    joinedAt: { $lte: periodEnd },
    $or: [{ leftAt: null }, { leftAt: { $gte: monthStart } }],
  })
    .populate({ path: "group", match: { isActive: true } })
    .populate({ path: "student", select: { isActive: 1 } });

  let created = 0;
  let skipped = 0;
  for (const m of memberships) {
    if (!m.group || !m.student) continue;
    if (m.student.isActive === false) {
      skipped += 1;
      continue;
    }
    // Guruh yakunlangan/arxivlangan bo'lsa: oy boshidan oldin tugagan bo'lsa — yozilmaydi
    const groupFin = m.group.finishedAt ? new Date(m.group.finishedAt) : null;
    if (groupFin && groupFin < monthStart) {
      skipped += 1;
      continue;
    }
    const before = await Invoice.findOne({
      student: m.student._id,
      group: m.group._id,
      "period.year": year,
      "period.month": month,
      status: NON_CANCELLED,
    });
    if (before) {
      skipped += 1;
      continue;
    }
    // O'qigan qism oxiri: a'zolik chiqishi yoki guruh tugashidan eng erkini (oy ichida bo'lsa)
    let effectiveEnd = m.leftAt && m.leftAt < periodEnd ? new Date(m.leftAt) : null;
    if (groupFin && groupFin < periodEnd) {
      effectiveEnd = effectiveEnd && effectiveEnd < groupFin ? effectiveEnd : groupFin;
    }
    await ensureInvoiceFor(m.student._id, m.group._id, m._id, { year, month }, {
      createdBy,
      effectiveEnd,
    });
    created += 1;
  }

  return { created, skipped, total: memberships.length };
};

// O'quvchi guruhdan chiqdi/arxivlandi — joriy oy hisobini o'qigan qismiga (prorate) moslaydi.
// Mavjud to'lanmagan/qisman hisob kamaytiriladi; ortiqcha to'langan bo'lsa farq balansga qaytariladi.
export const reconcileOnLeave = async (
  studentId,
  group,
  membershipId,
  { year, month },
  effectiveEnd,
  { createdBy = null } = {},
) => {
  ensurePeriod({ year, month });
  if (!group) return null;

  const newBase = proratedBase(group, { year, month }, effectiveEnd);
  const { amount: discountAmount, snapshot } = await computeDiscountAmount(
    studentId,
    newBase,
    undefined,
    group._id,
  );
  const newTotalDue = Math.max(0, newBase - discountAmount);

  const invoice = await Invoice.findOne({
    student: studentId,
    group: group._id,
    "period.year": year,
    "period.month": month,
    status: NON_CANCELLED,
  });

  // Hisob hali yo'q — o'qigan qismi bor bo'lsa, prorate bilan yaratamiz
  if (!invoice) {
    if (newBase <= 0) return null;
    return ensureInvoiceFor(studentId, group._id, membershipId, { year, month }, {
      createdBy,
      effectiveEnd,
    });
  }

  invoice.baseAmount = newBase;
  invoice.discountAmount = discountAmount;
  invoice.discountSnapshot = snapshot;
  invoice.totalDue = newTotalDue;

  // Ortiqcha to'langan bo'lsa — farqni o'quvchi balansiga qaytaramiz
  if (invoice.paidAmount > newTotalDue) {
    const excess = invoice.paidAmount - newTotalDue;
    const student = await User.findById(studentId);
    if (student) {
      student.balance = (Number(student.balance) || 0) + excess;
      await student.save();
    }
    invoice.paidAmount = newTotalDue;
    if (invoice.appliedBalance) {
      invoice.appliedBalance = Math.min(invoice.appliedBalance, newTotalDue);
    }
  }

  invoice.status =
    invoice.paidAmount >= newTotalDue
      ? "paid"
      : invoice.paidAmount > 0
        ? "partial"
        : "unpaid";
  await invoice.save();
  return invoice;
};

const STUDENT_PROJECTION = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
  balance: 1,
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
  const filter = { isDeleted: { $ne: true } };
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
    { $match: { invoice: invoice._id, isDeleted: { $ne: true } } },
    { $group: { _id: "$type", sum: { $sum: "$amount" } } },
  ]).session(session || null);

  let paid = 0;
  let refunded = 0;
  for (const g of groups) {
    if (g._id === "payment") paid = g.sum;
    if (g._id === "refund") refunded = g.sum;
  }
  const net = Math.max(0, paid - refunded);
  // To'langan = haqiqiy to'lovlar + balansdan yechilgan summa.
  // Qarzdan ortig'i balansga ketgani uchun paidAmount totalDue bilan cheklanadi.
  const credited = net + (invoice.appliedBalance || 0);

  invoice.paidAmount = Math.min(invoice.totalDue, credited);
  invoice.status = computeStatus(invoice.totalDue, credited);
  await invoice.save(opts);
  return invoice;
};

// O'qituvchi kelmagan kun chegirmasini qo'llaydi (amount > 0). Hisob totalDue
// kamayadi; ortiqcha to'langan summa o'quvchi balansiga o'tadi.
// Returns { deducted, balanceCredited, appliedBalanceReduced } — teskari qilish uchun.
export const applyAbsenceDeduction = async (invoiceId, amount, session = null) => {
  const opts = session ? { session } : {};
  const invoice = await Invoice.findById(invoiceId, null, opts);
  if (!invoice || invoice.status === "cancelled") {
    return { deducted: 0, balanceCredited: 0, appliedBalanceReduced: 0 };
  }

  const before = invoice.teacherAbsenceDeduction || 0;
  const after = Math.max(0, before + amount);
  const deducted = after - before;
  invoice.teacherAbsenceDeduction = after;
  invoice.totalDue = Math.max(
    0,
    (invoice.baseAmount || 0) - (invoice.discountAmount || 0) - after,
  );

  const net = await computeNetPaid(invoice._id, session);
  const credited = net + (invoice.appliedBalance || 0);
  let balanceCredited = 0;
  let appliedBalanceReduced = 0;
  if (credited > invoice.totalDue) {
    const overflow = credited - invoice.totalDue;
    appliedBalanceReduced = Math.min(overflow, invoice.appliedBalance || 0);
    invoice.appliedBalance = (invoice.appliedBalance || 0) - appliedBalanceReduced;
    balanceCredited = overflow;
    const student = await User.findById(invoice.student, null, opts);
    if (student) {
      student.balance = (Number(student.balance) || 0) + overflow;
      await student.save(opts);
    }
  }
  await invoice.save(opts);
  await recompute(invoice._id, session);
  return { deducted, balanceCredited, appliedBalanceReduced };
};

// applyAbsenceDeduction ning aniq teskarisi (o'qituvchi qaytadan "keldi" bo'lganda).
export const reverseAbsenceDeduction = async (invoiceId, app, session = null) => {
  const opts = session ? { session } : {};
  const invoice = await Invoice.findById(invoiceId, null, opts);
  if (!invoice || invoice.status === "cancelled") return;

  invoice.teacherAbsenceDeduction = Math.max(
    0,
    (invoice.teacherAbsenceDeduction || 0) - (app.deducted || 0),
  );
  invoice.totalDue = Math.max(
    0,
    (invoice.baseAmount || 0) -
      (invoice.discountAmount || 0) -
      invoice.teacherAbsenceDeduction,
  );
  invoice.appliedBalance =
    (invoice.appliedBalance || 0) + (app.appliedBalanceReduced || 0);
  await invoice.save(opts);

  if (app.balanceCredited > 0) {
    const student = await User.findById(invoice.student, null, opts);
    if (student) {
      student.balance = Math.max(
        0,
        (Number(student.balance) || 0) - app.balanceCredited,
      );
      await student.save(opts);
    }
  }
  await recompute(invoice._id, session);
};

export const computeNetPaid = async (invoiceId, session = null) => {
  const groups = await Payment.aggregate([
    { $match: { invoice: new mongoose.Types.ObjectId(String(invoiceId)), isDeleted: { $ne: true } } },
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
    throw new ApiError(400, "O'quvchi topilmadi");
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
    const auto = await computeDiscountAmount(
      body.student,
      baseAmount,
      undefined,
      body.group,
    );
    discountAmount = auto.amount;
    snapshot = auto.snapshot;
  }
  const totalDue = Math.max(0, baseAmount - discountAmount);

  const settings = await getSettings();
  const dueDate = body.dueDate
    ? new Date(body.dueDate)
    : computeDueDate(body.period, settings.dueDayOfMonth);

  const invoice = await Invoice.create({
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
  // Yangi hisob: o'quvchi balansidan avtomatik yechib qo'yamiz
  await applyStudentBalance(invoice);
  return invoice;
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

  // Balansdan yechilgan bo'lsa — o'quvchi balansiga qaytaramiz
  if (invoice.appliedBalance > 0) {
    const student = await User.findById(invoice.student);
    if (student) {
      student.balance = (Number(student.balance) || 0) + invoice.appliedBalance;
      await student.save();
    }
    invoice.appliedBalance = 0;
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
