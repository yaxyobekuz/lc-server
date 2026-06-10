import mongoose from "mongoose";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import GroupFee from "../../../models/groupFee.model.js";
import Discount from "../../../models/discount.model.js";
import StudentFreeze from "../../../models/studentFreeze.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { computePaymentSnapshot, deriveStatus } from "./proration.helper.js";

const safeStudentProjection = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
};

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

// Bir o'quvchi+guruh+oy uchun snapshot maydonlarini hisoblaydi (DB dan yuklab).
const buildSnapshot = async ({ student, group, year, month, joinedAt }) => {
  const [feeDoc, discounts, freezes] = await Promise.all([
    GroupFee.findOne({ group, year, month }),
    Discount.find({
      student,
      group,
      isActive: true,
      isDeleted: { $ne: true },
      $or: [{ scope: "permanent" }, { scope: "monthly", year, month }],
    }),
    StudentFreeze.find({ student, isActive: true, isDeleted: { $ne: true } }),
  ]);

  return computePaymentSnapshot({
    baseFee: feeDoc ? feeDoc.amount : 0,
    year,
    month,
    joinedAt,
    freezes,
    discounts,
  });
};

// Faol (o'chirilmagan) tranzaksiyalar yig'indisidan paidAmount/status ni yangilaydi.
export const recalcStatus = async (paymentId) => {
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) return null;
  const agg = await PaymentTransaction.aggregate([
    { $match: { payment: payment._id, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const paidAmount = agg.length ? agg[0].total : 0;
  payment.paidAmount = paidAmount;
  payment.status = deriveStatus(paidAmount, payment.expectedAmount);
  await payment.save();
  return payment;
};

// Snapshot (fee/proratsiya/chegirma) ni qayta hisoblab, statusni ham yangilaydi.
export const recalc = async (paymentId) => {
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) return null;

  let joinedAt = null;
  if (payment.membership) {
    const m = await GroupMembership.findById(payment.membership);
    joinedAt = m ? m.joinedAt : null;
  }

  const snap = await buildSnapshot({
    student: payment.student,
    group: payment.group,
    year: payment.year,
    month: payment.month,
    joinedAt,
  });

  payment.baseFee = snap.baseFee;
  payment.prorationFactor = snap.prorationFactor;
  payment.discountApplied = snap.discountApplied;
  payment.expectedAmount = snap.expectedAmount;
  payment.status = deriveStatus(payment.paidAmount, snap.expectedAmount);
  payment.recalculatedAt = new Date();
  await payment.save();
  return payment;
};

// Guruh+oy bo'yicha barcha to'lovlarni qayta hisoblaydi (fee o'zgarganda).
export const recalcForGroupMonth = async (group, year, month) => {
  const payments = await StudentPayment.find({ group, year, month }, { _id: 1 });
  for (const p of payments) {
    await recalc(p._id);
  }
  return payments.length;
};

// O'quvchi+guruh chegirmasi o'zgarganda tegishli oylarni qayta hisoblaydi.
// monthly chegirma → faqat shu oy; permanent → barcha mavjud oylar.
export const recalcForStudentScope = async (student, group, { scope, year, month } = {}) => {
  const filter = { student, group };
  if (scope === "monthly" && year && month) {
    filter.year = year;
    filter.month = month;
  }
  const payments = await StudentPayment.find(filter, { _id: 1 });
  for (const p of payments) {
    await recalc(p._id);
  }
  return payments.length;
};

// O'quvchi muzlatilganda tegishli barcha guruh/oy to'lovlarini qayta hisoblaydi.
export const recalcForStudent = async (student) => {
  const payments = await StudentPayment.find({ student }, { _id: 1 });
  for (const p of payments) {
    await recalc(p._id);
  }
  return payments.length;
};

// Bitta a'zolik uchun (o'quvchi guruhga qo'shilganda) shu oy to'lovini yaratadi.
export const ensurePaymentForMembership = async (membership, year, month) => {
  if (!membership) return null;
  const exists = await StudentPayment.findOne({
    student: membership.student,
    group: membership.group,
    year,
    month,
  });
  if (exists) return exists;

  const snap = await buildSnapshot({
    student: membership.student,
    group: membership.group,
    year,
    month,
    joinedAt: membership.joinedAt,
  });

  try {
    return await StudentPayment.create({
      student: membership.student,
      group: membership.group,
      membership: membership._id,
      year,
      month,
      ...snap,
      paidAmount: 0,
      status: deriveStatus(0, snap.expectedAmount),
      recalculatedAt: new Date(),
    });
  } catch (err) {
    // Unique index poyga holati (parallel generatsiya) - mavjudni qaytaramiz
    if (err?.code === 11000) {
      return StudentPayment.findOne({
        student: membership.student,
        group: membership.group,
        year,
        month,
      });
    }
    throw err;
  }
};

// Berilgan oy uchun barcha faol a'zoliklarga to'lov yaratadi (job + regenerate).
export const generateMonth = async (year, month) => {
  const activeGroupIds = await Group.find(
    { isActive: true, status: "active", isDeleted: { $ne: true } },
    { _id: 1 },
  );
  const ids = activeGroupIds.map((g) => g._id);

  const memberships = await GroupMembership.find({
    group: { $in: ids },
    leftAt: null,
    isDeleted: { $ne: true },
  });

  let created = 0;
  for (const m of memberships) {
    const existed = await StudentPayment.findOne({
      student: m.student,
      group: m.group,
      year,
      month,
    });
    if (existed) continue;
    await ensurePaymentForMembership(m, year, month);
    created += 1;
  }
  return { memberships: memberships.length, created };
};

export const list = async ({
  groupId,
  year,
  month,
  status,
  search,
  page = 1,
  limit = 50,
}) => {
  const filter = {};
  if (groupId) filter.group = toObjectId(groupId);
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  let query = StudentPayment.find(filter)
    .populate("student", safeStudentProjection)
    .populate("group", { name: 1 })
    .sort({ createdAt: -1 });

  let items = await query.skip(skip).limit(limit);

  // Ism bo'yicha qidiruv (populate'dan keyin - oddiy filtr)
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    items = items.filter((p) => {
      const st = p.student;
      if (!st) return false;
      return `${st.firstName} ${st.lastName} ${st.username}`
        .toLowerCase()
        .includes(s);
    });
  }

  const total = await StudentPayment.countDocuments(filter);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const payment = await StudentPayment.findById(id)
    .populate("student", safeStudentProjection)
    .populate("group", { name: 1 })
    .populate("membership", { joinedAt: 1 });
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  const transactions = await PaymentTransaction.find({
    payment: payment._id,
    isDeleted: { $ne: true },
  }).sort({ paidAt: -1, createdAt: -1 });

  return { ...payment.toJSON(), transactions };
};
