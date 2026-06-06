import mongoose from "mongoose";
import Salary from "../../../models/salary.model.js";
import SalaryPayout from "../../../models/salaryPayout.model.js";
import TeacherGroupRate from "../../../models/teacherGroupRate.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import TeacherAttendance from "../../../models/teacherAttendance.model.js";
import User from "../../../models/user.model.js";
import PaymentMethod from "../../../models/paymentMethod.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  monthRange,
  computeGroupBreakdown,
  recomputeFinal,
  assertCanRecompute,
  assertCanReceivePayout,
  computePaymentStatus,
  previousMonthOf,
} from "../../../helpers/salary.helper.js";
import { get as getSettings } from "../../salarySettings/services/salarySettings.service.js";

const TEACHER_PROJECTION = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
  isActive: 1,
};

const ensureTeacher = async (teacherId) => {
  const u = await User.findById(teacherId);
  if (!u || u.role !== ROLES.TEACHER) {
    throw new ApiError(400, "O'qituvchi topilmadi");
  }
  return u;
};

const ensureMethod = async (methodId) => {
  const m = await PaymentMethod.findById(methodId);
  if (!m) throw new ApiError(400, "To'lov usuli topilmadi");
  if (!m.isActive) throw new ApiError(400, "To'lov usuli faol emas");
  return m;
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

export const list = async ({
  teacherId,
  year,
  month,
  status,
  page = 1,
  limit = 20,
}) => {
  const filter = { isDeleted: { $ne: true } };
  if (teacherId) filter.teacher = teacherId;
  if (year) filter["period.year"] = Number(year);
  if (month) filter["period.month"] = Number(month);
  if (status) filter.status = status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Salary.find(filter)
      .sort({ "period.year": -1, "period.month": -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("teacher", TEACHER_PROJECTION),
    Salary.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const salary = await Salary.findById(id)
    .populate("teacher", TEACHER_PROJECTION)
    .populate("groupBreakdowns.group", { name: 1, monthlyPrice: 1 })
    .populate("approvedBy", { firstName: 1, lastName: 1 })
    .populate("calculatedBy", { firstName: 1, lastName: 1 })
    .populate("cancelledBy", { firstName: 1, lastName: 1 })
    .populate("adjustments.createdBy", { firstName: 1, lastName: 1 });
  if (!salary) throw new ApiError(404, "Oylik topilmadi");
  return salary;
};

export const getPayouts = async (salaryId) => {
  const items = await SalaryPayout.find({ salary: salaryId, isDeleted: { $ne: true } })
    .sort({ paidAt: -1, createdAt: -1 })
    .populate("method", { name: 1, code: 1, isActive: 1 })
    .populate("paidBy", { firstName: 1, lastName: 1 });
  return items;
};

// Bitta o'qituvchi uchun oylik shakllantirish (yoki qayta hisoblash)
// `paid`/`cancelled` mavjud bo'lsa skip qilinadi.
// Returns: { salary, action: "created"|"recomputed"|"skipped" }
export const calculateForTeacher = async (
  teacherId,
  { year, month },
  currentUser,
) => {
  const teacher = await ensureTeacher(teacherId);
  const period = { year: Number(year), month: Number(month) };

  // Shu oyda sana bo'yicha faol bo'lgan stavkalar — almashtirilgan
  // (effectiveTo qo'yilgan) o'qituvchi ham o'z davri uchun alohida oylik oladi.
  const { start: pStart, end: pEnd } = monthRange(period.year, period.month);
  const rates = await TeacherGroupRate.find({
    teacher: teacher._id,
    effectiveFrom: { $lt: pEnd },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: pStart } }],
  });

  const breakdowns = [];
  let componentsSum = 0;
  let minTotal = 0;
  for (const rate of rates) {
    const group = await Group.findById(rate.group);
    if (!group) continue;
    const bd = await computeGroupBreakdown(rate, group, period);
    breakdowns.push(bd);
    componentsSum += bd.subtotal;
    minTotal += rate.minMonthlyAmount || 0;
  }
  // Minimal kafolatli oylik: jami summa minimaldan past bo'lmasin
  const baseAmount = Math.round(Math.max(componentsSum, minTotal));

  // Mavjud non-cancelled salaryni topamiz
  const existing = await Salary.findOne({
    teacher: teacher._id,
    "period.year": period.year,
    "period.month": period.month,
    status: { $ne: "cancelled" },
  });

  if (existing) {
    if (existing.status === "paid") {
      return { salary: existing, action: "skipped" };
    }
    existing.groupBreakdowns = breakdowns;
    existing.baseAmount = baseAmount;
    existing.calculatedAt = new Date();
    existing.calculatedBy = currentUser?._id || null;
    recomputeFinal(existing);
    await existing.save();
    return { salary: existing, action: "recomputed" };
  }

  const created = await Salary.create({
    teacher: teacher._id,
    period,
    groupBreakdowns: breakdowns,
    baseAmount,
    adjustments: [],
    bonusTotal: 0,
    penaltyTotal: 0,
    advanceTotal: 0,
    deductionTotal: 0,
    finalAmount: baseAmount,
    paidAmount: 0,
    status: "calculated",
    calculatedAt: new Date(),
    calculatedBy: currentUser?._id || null,
  });
  return { salary: created, action: "created" };
};

// Hamma faol o'qituvchilar uchun ushbu oy uchun oylik shakllantirish
// Returns: { created, recomputed, skipped, errors }
export const calculateForAll = async ({ year, month }, currentUser) => {
  const teachers = await User.find({ role: ROLES.TEACHER, isActive: true });
  const summary = { created: 0, recomputed: 0, skipped: 0, errors: 0 };
  const settings = await getSettings();
  const createdOrRecomputed = [];

  for (const t of teachers) {
    try {
      const { action, salary } = await calculateForTeacher(
        t._id,
        { year, month },
        currentUser,
      );
      summary[action] += 1;
      if (action === "created" || action === "recomputed") {
        createdOrRecomputed.push(salary);
      }
    } catch (err) {
      summary.errors += 1;
    }
  }

  // Notify (lazy import - circular avoidance)
  if (settings.notifyOnCalculated) {
    try {
      const { notifyCalculated } = await import(
        "../../../bot/services/salaryNotify.service.js"
      );
      for (const s of createdOrRecomputed) {
        try {
          await notifyCalculated(s.teacher, s);
        } catch {
          /* noop */
        }
      }
    } catch {
      /* noop */
    }
  }

  return summary;
};

export const recompute = async (salaryId, currentUser) => {
  const salary = await Salary.findById(salaryId);
  if (!salary) throw new ApiError(404, "Oylik topilmadi");
  assertCanRecompute(salary);

  const { start: pStart, end: pEnd } = monthRange(
    salary.period.year,
    salary.period.month,
  );
  const rates = await TeacherGroupRate.find({
    teacher: salary.teacher,
    effectiveFrom: { $lt: pEnd },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: pStart } }],
  });
  const breakdowns = [];
  let componentsSum = 0;
  let minTotal = 0;
  for (const rate of rates) {
    const group = await Group.findById(rate.group);
    if (!group) continue;
    const bd = await computeGroupBreakdown(rate, group, salary.period);
    breakdowns.push(bd);
    componentsSum += bd.subtotal;
    minTotal += rate.minMonthlyAmount || 0;
  }

  salary.groupBreakdowns = breakdowns;
  salary.baseAmount = Math.round(Math.max(componentsSum, minTotal));
  salary.calculatedAt = new Date();
  salary.calculatedBy = currentUser?._id || null;
  recomputeFinal(salary);
  await salary.save();
  return salary;
};

export const approve = async (salaryId, currentUser) => {
  const salary = await Salary.findById(salaryId);
  if (!salary) throw new ApiError(404, "Oylik topilmadi");
  if (salary.status !== "calculated") {
    throw new ApiError(409, "Faqat hisoblangan oylikni tasdiqlash mumkin");
  }
  salary.status = "approved";
  salary.approvedAt = new Date();
  salary.approvedBy = currentUser._id;
  await salary.save();
  return salary;
};

export const cancel = async (salaryId, body, currentUser) => {
  const salary = await Salary.findById(salaryId);
  if (!salary) throw new ApiError(404, "Oylik topilmadi");
  if (salary.status === "cancelled") {
    throw new ApiError(409, "Allaqachon bekor qilingan");
  }
  const payoutsCount = await SalaryPayout.countDocuments({
    salary: salary._id,
  });
  if (payoutsCount > 0) {
    throw new ApiError(
      409,
      "To'lovlar bor - avval to'lovlarni o'chiring yoki yangi oylik yarating",
    );
  }
  salary.status = "cancelled";
  salary.cancelledAt = new Date();
  salary.cancelledBy = currentUser._id;
  salary.cancelledReason = body?.reason || "";
  await salary.save();
  return salary;
};

export const addAdjustment = async (salaryId, body, currentUser) => {
  const salary = await Salary.findById(salaryId);
  if (!salary) throw new ApiError(404, "Oylik topilmadi");
  if (salary.status === "paid" || salary.status === "cancelled") {
    throw new ApiError(409, "Bu oylikga o'zgartirish kiritib bo'lmaydi");
  }
  const amount = Number(body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, "Summa noto'g'ri");

  salary.adjustments.push({
    type: body.type,
    amount,
    reason: body.reason || "",
    createdBy: currentUser._id,
    createdAt: new Date(),
  });
  recomputeFinal(salary);
  await salary.save();
  return salary;
};

export const removeAdjustment = async (salaryId, adjustmentId, currentUser) => {
  const salary = await Salary.findById(salaryId);
  if (!salary) throw new ApiError(404, "Oylik topilmadi");
  if (salary.status === "paid" || salary.status === "cancelled") {
    throw new ApiError(409, "Bu oylikga o'zgartirish kiritib bo'lmaydi");
  }
  const before = salary.adjustments.length;
  salary.adjustments = salary.adjustments.filter(
    (a) => String(a._id) !== String(adjustmentId),
  );
  if (salary.adjustments.length === before) {
    throw new ApiError(404, "O'zgartirish topilmadi");
  }
  recomputeFinal(salary);
  await salary.save();
  return salary;
};

const nextPeriodOf = ({ year, month }) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

// Ortiqcha to'lovni keyingi oy avansiga (advance adjustment) yozadi
const carryExcessToNextMonth = async (salary, excess, currentUser) => {
  const next = nextPeriodOf(salary.period);
  const { salary: nextSalary } = await calculateForTeacher(
    salary.teacher,
    next,
    currentUser,
  );
  if (
    !nextSalary ||
    nextSalary.status === "paid" ||
    nextSalary.status === "cancelled"
  ) {
    return;
  }
  nextSalary.adjustments.push({
    type: "advance",
    amount: Math.round(excess),
    reason: "Oldingi oy oyligidan ortiqcha to'lov (avans)",
    createdBy: currentUser?._id || null,
    createdAt: new Date(),
  });
  recomputeFinal(nextSalary);
  await nextSalary.save();
};

export const recordPayout = async (salaryId, body, currentUser) => {
  const amount = Number(body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, "Summa noto'g'ri");
  await ensureMethod(body.methodId);

  const { created, salary, excess } = await runWithSession(async (session) => {
    const opts = session ? { session } : {};
    const salary = await Salary.findById(salaryId, null, opts);
    if (!salary) throw new ApiError(404, "Oylik topilmadi");
    assertCanReceivePayout(salary);

    const remaining = Math.max(
      0,
      (salary.finalAmount || 0) - (salary.paidAmount || 0),
    );
    // Shu oylik faqat qoldiq qadar to'lanadi, ortiqchasi avansga ketadi
    const payoutForThis = Math.round(Math.min(amount, remaining));
    const excess = Math.round(amount - payoutForThis);

    const created = await SalaryPayout.create(
      [
        {
          salary: salary._id,
          teacher: salary.teacher,
          amount: payoutForThis,
          method: body.methodId,
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          paidBy: currentUser._id,
          note: body.note || "",
        },
      ],
      session ? { session } : undefined,
    );

    salary.paidAmount = Math.round((salary.paidAmount || 0) + payoutForThis);
    salary.status = computePaymentStatus(salary.finalAmount, salary.paidAmount);
    await salary.save(opts);

    return { created: created[0], salary, excess };
  });

  // Ortiqcha to'lov -> keyingi oy avansiga (transaksiyadan tashqari, best-effort)
  if (excess > 0) {
    try {
      await carryExcessToNextMonth(salary, excess, currentUser);
    } catch {
      /* keyingi oy avansini yozib bo'lmadi - asosiy to'lov saqlandi */
    }
  }

  // Notify (lazy import)
  try {
    const settings = await getSettings();
    if (settings.notifyOnPaid) {
      const { notifyPaid } = await import(
        "../../../bot/services/salaryNotify.service.js"
      );
      await notifyPaid(salary.teacher, created, salary);
    }
  } catch {
    /* noop */
  }

  return { payout: created, carriedToAdvance: excess > 0 ? excess : 0 };
};

// Bir nechta oylikni birvarakayiga to'lash.
// amount berilsa - har biriga o'sha summa; berilmasa - har biriga to'liq qoldiq.
// Ortiqcha qism har bir o'qituvchining keyingi oy avansiga yoziladi (recordPayout mantig'i).
export const recordPayoutBatch = async (salaryIds, body, currentUser) => {
  await ensureMethod(body.methodId);
  const fixedAmount =
    body.amount != null && Number(body.amount) > 0 ? Number(body.amount) : null;

  const summary = { paid: 0, skipped: 0, errors: 0, totalPaid: 0, carried: 0 };
  for (const id of salaryIds) {
    try {
      const salary = await Salary.findById(id).select({
        finalAmount: 1,
        paidAmount: 1,
        status: 1,
      });
      if (
        !salary ||
        salary.status === "paid" ||
        salary.status === "cancelled"
      ) {
        summary.skipped += 1;
        continue;
      }
      const remaining = Math.max(
        0,
        (salary.finalAmount || 0) - (salary.paidAmount || 0),
      );
      const amount = fixedAmount != null ? fixedAmount : remaining;
      if (amount <= 0) {
        summary.skipped += 1;
        continue;
      }
      const { payout, carriedToAdvance } = await recordPayout(
        id,
        {
          amount,
          methodId: body.methodId,
          paidAt: body.paidAt,
          note: body.note || "",
        },
        currentUser,
      );
      summary.paid += 1;
      summary.totalPaid += payout?.amount || 0;
      summary.carried += carriedToAdvance || 0;
    } catch {
      summary.errors += 1;
    }
  }
  return summary;
};

export const removePayout = async (payoutId, currentUser) => {
  return runWithSession(async (session) => {
    const opts = session ? { session } : {};
    const payout = await SalaryPayout.findById(payoutId, null, opts);
    if (!payout) throw new ApiError(404, "To'lov topilmadi");
    const salary = await Salary.findById(payout.salary, null, opts);
    if (!salary) throw new ApiError(404, "Oylik topilmadi");
    if (salary.status === "cancelled") {
      throw new ApiError(409, "Bekor qilingan oylik to'lovini o'chirib bo'lmaydi");
    }

    await SalaryPayout.updateOne(
      { _id: payout._id },
      { $set: { isDeleted: true, deletedAt: new Date() } },
      opts,
    );
    salary.paidAmount = Math.max(
      0,
      Math.round((salary.paidAmount || 0) - payout.amount),
    );
    salary.status = computePaymentStatus(salary.finalAmount, salary.paidAmount);
    await salary.save(opts);
    return { ok: true };
  });
};

// Owner dashboard: umumiy statistikalar (oy yoki yil filteri)
export const getDashboardStats = async ({ year, month } = {}) => {
  const filter = { status: { $ne: "cancelled" }, isDeleted: { $ne: true } };
  if (year) filter["period.year"] = Number(year);
  if (month) filter["period.month"] = Number(month);

  const totals = await Salary.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalFinal: { $sum: "$finalAmount" },
        totalPaid: { $sum: "$paidAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const byStatus = await Salary.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        sum: { $sum: "$finalAmount" },
      },
    },
  ]);

  const topEarners = await Salary.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$teacher",
        total: { $sum: "$finalAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "teacher",
      },
    },
    { $unwind: "$teacher" },
    {
      $project: {
        _id: 0,
        teacherId: "$_id",
        total: 1,
        count: 1,
        firstName: "$teacher.firstName",
        lastName: "$teacher.lastName",
      },
    },
  ]);

  const t = totals[0] || { totalFinal: 0, totalPaid: 0, count: 0 };
  const totalUnpaid = Math.max(0, t.totalFinal - t.totalPaid);

  return {
    totalFinal: t.totalFinal,
    totalPaid: t.totalPaid,
    totalUnpaid,
    salariesCount: t.count,
    byStatus,
    topEarners,
  };
};

// So'nggi N oy uchun trend
export const getMonthlyTrend = async ({ months = 6 } = {}) => {
  const now = new Date();
  const periods = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    periods.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }

  const result = [];
  for (const p of periods) {
    const stats = await Salary.aggregate([
      {
        $match: {
          status: { $ne: "cancelled" },
          "period.year": p.year,
          "period.month": p.month,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$finalAmount" },
          paid: { $sum: "$paidAmount" },
          count: { $sum: 1 },
        },
      },
    ]);
    const r = stats[0] || { total: 0, paid: 0, count: 0 };
    result.push({
      year: p.year,
      month: p.month,
      total: r.total,
      paid: r.paid,
      count: r.count,
    });
  }
  return result;
};

// Guruh jadvalidan haftalik dars soatini hisoblaydi (HH:mm slotlar yig'indisi)
const groupWeeklyHours = (group) => {
  let mins = 0;
  for (const slot of group?.schedule || []) {
    const [sh, sm] = String(slot.startTime || "0:0").split(":").map(Number);
    const [eh, em] = String(slot.endTime || "0:0").split(":").map(Number);
    const d = (eh * 60 + em) - (sh * 60 + sm);
    if (d > 0) mins += d;
  }
  return mins / 60;
};

// Owner dashboard: oy uchun har bir o'qituvchi kesimida hisobot.
// Daromad reytingi + ish hajmi (haftalik soat, o'quvchilar, guruhlar) + bonus/jarima.
// Ish hajmi to'lov turidan qat'i nazar guruh jadvali va a'zoliklaridan hisoblanadi.
export const getTeacherReport = async ({ year, month } = {}) => {
  const filter = { status: { $ne: "cancelled" }, isDeleted: { $ne: true } };
  if (year) filter["period.year"] = Number(year);
  if (month) filter["period.month"] = Number(month);

  const salaries = await Salary.find(filter)
    .select({
      teacher: 1,
      period: 1,
      finalAmount: 1,
      paidAmount: 1,
      bonusTotal: 1,
      penaltyTotal: 1,
      status: 1,
      groupBreakdowns: 1,
    })
    .populate("teacher", TEACHER_PROJECTION);

  // Barcha guruh id'larini yig'ib, jadval va o'quvchilar sonini bitta so'rovda olamiz
  const idSet = new Set();
  for (const s of salaries)
    for (const b of s.groupBreakdowns || [])
      if (b.group) idSet.add(String(b.group));
  const ids = [...idSet];

  const groups = ids.length
    ? await Group.find({ _id: { $in: ids } }).select({ schedule: 1 })
    : [];
  const groupMap = new Map(groups.map((g) => [String(g._id), g]));

  const memberAgg = ids.length
    ? await GroupMembership.aggregate([
        {
          $match: {
            group: { $in: groups.map((g) => g._id) },
            leftAt: null,
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: "$group", count: { $sum: 1 } } },
      ])
    : [];
  const memberMap = new Map(memberAgg.map((m) => [String(m._id), m.count]));

  // Oy davomida kelmagan kunlar soni (o'qituvchi davomatidan)
  let absentMap = new Map();
  if (year && month) {
    const prefix = `${Number(year)}-${String(Number(month)).padStart(2, "0")}-`;
    const absAgg = await TeacherAttendance.aggregate([
      { $match: { dateKey: { $regex: `^${prefix}` }, status: "absent" } },
      { $group: { _id: "$teacher", count: { $sum: 1 } } },
    ]);
    absentMap = new Map(absAgg.map((a) => [String(a._id), a.count]));
  }

  const rows = salaries
    .filter((s) => s.teacher)
    .map((s) => {
      const breakdowns = s.groupBreakdowns || [];
      let weeklyHours = 0;
      let studentsCount = 0;
      for (const b of breakdowns) {
        const g = groupMap.get(String(b.group));
        if (g) weeklyHours += groupWeeklyHours(g);
        studentsCount += memberMap.get(String(b.group)) || 0;
      }
      const finalAmount = s.finalAmount || 0;
      const paidAmount = s.paidAmount || 0;
      return {
        salaryId: s._id,
        teacherId: s.teacher._id,
        firstName: s.teacher.firstName || "",
        lastName: s.teacher.lastName || "",
        status: s.status,
        finalAmount,
        paidAmount,
        remaining: Math.max(0, finalAmount - paidAmount),
        bonusTotal: s.bonusTotal || 0,
        penaltyTotal: s.penaltyTotal || 0,
        groupsCount: breakdowns.length,
        weeklyHours: Math.round(weeklyHours * 10) / 10,
        studentsCount,
        absentDays: absentMap.get(String(s.teacher._id)) || 0,
      };
    });

  rows.sort((a, b) => b.finalAmount - a.finalAmount);
  return rows;
};

// Profile/teacher panel uchun summary
export const getTeacherSummary = async (teacherId) => {
  const tid = new mongoose.Types.ObjectId(String(teacherId));
  const now = new Date();
  const curY = now.getUTCFullYear();
  const curM = now.getUTCMonth() + 1;
  const prev =
    curM === 1
      ? { year: curY - 1, month: 12 }
      : { year: curY, month: curM - 1 };

  const [currentMonth, lastMonth, yearAgg, lifetimeAgg] = await Promise.all([
    Salary.findOne({
      teacher: tid,
      "period.year": curY,
      "period.month": curM,
      status: { $ne: "cancelled" },
    }).select({
      finalAmount: 1,
      paidAmount: 1,
      status: 1,
      baseAmount: 1,
      bonusTotal: 1,
      penaltyTotal: 1,
      advanceTotal: 1,
      deductionTotal: 1,
      period: 1,
    }),
    Salary.findOne({
      teacher: tid,
      "period.year": prev.year,
      "period.month": prev.month,
      status: { $ne: "cancelled" },
    }).select({ finalAmount: 1, paidAmount: 1, status: 1, period: 1 }),
    Salary.aggregate([
      {
        $match: {
          teacher: tid,
          status: { $ne: "cancelled" },
          "period.year": curY,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$finalAmount" },
          paid: { $sum: "$paidAmount" },
        },
      },
    ]),
    Salary.aggregate([
      { $match: { teacher: tid, status: { $ne: "cancelled" } } },
      {
        $group: {
          _id: null,
          total: { $sum: "$finalAmount" },
          paid: { $sum: "$paidAmount" },
        },
      },
    ]),
  ]);

  return {
    currentMonth: currentMonth || null,
    lastMonth: lastMonth || null,
    yearTotal: yearAgg[0]?.total || 0,
    yearPaid: yearAgg[0]?.paid || 0,
    lifetimeTotal: lifetimeAgg[0]?.total || 0,
    lifetimePaid: lifetimeAgg[0]?.paid || 0,
  };
};

// Bot uchun joriy oy salary doc + payouts
export const getMyCurrentMonth = async (teacherId) => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const salary = await Salary.findOne({
    teacher: teacherId,
    "period.year": y,
    "period.month": m,
    status: { $ne: "cancelled" },
  });
  const payouts = salary
    ? await SalaryPayout.find({ salary: salary._id })
        .sort({ paidAt: -1 })
        .populate("method", { name: 1 })
    : [];
  return { salary, payouts, period: { year: y, month: m } };
};

// Teacher panel - tarix
export const getMyHistory = async (teacherId, { page = 1, limit = 20 } = {}) => {
  const filter = { teacher: teacherId };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Salary.find(filter)
      .sort({ "period.year": -1, "period.month": -1 })
      .skip(skip)
      .limit(limit),
    Salary.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

// Teacher own access tekshiruvi
export const ensureTeacherOwns = async (salaryId, teacherId) => {
  const s = await Salary.findById(salaryId).select({ teacher: 1 });
  if (!s) throw new ApiError(404, "Oylik topilmadi");
  if (String(s.teacher) !== String(teacherId)) {
    throw new ApiError(403, "Ruxsat yo'q");
  }
  return true;
};

export { previousMonthOf };
