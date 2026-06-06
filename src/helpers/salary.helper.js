// Salary helper - period range, group breakdown computation, payment aggregation
import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import Invoice from "../models/invoice.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import ApiError from "../utils/ApiError.js";
import { getClassDaysInRange, toUtcMidnight } from "./attendance.helper.js";

// Guruhdagi faol o'quvchilar soni (per_student hisob uchun)
const countActiveStudents = async (groupId) =>
  GroupMembership.countDocuments({
    group: groupId,
    leftAt: null,
    isDeleted: { $ne: true },
  });

// Oyning UTC midnight intervalini qaytaradi
export const monthRange = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  // Keyingi oy boshi - ekskluziv chegara
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { start, end };
};

// Oxirgi oyning {year, month} ni qaytaradi (auto job uchun)
export const previousMonthOf = (date = new Date()) => {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based; oldingi oy
  if (m === 0) return { year: y - 1, month: 12 };
  return { year: y, month: m };
};

// Shu guruh va vaqt diapazonida o'quvchilardan kelgan to'lovlar yig'indisi
// (`payment` − `refund`). Cash-flow asosida.
export const aggregateGroupPayments = async (groupId, period, range) => {
  const { start, end } = range || monthRange(period.year, period.month);
  const gid = new mongoose.Types.ObjectId(String(groupId));

  // Payment + Invoice join (Invoice.group = G)
  const result = await Payment.aggregate([
    {
      $match: {
        paidAt: { $gte: start, $lt: end },
        isDeleted: { $ne: true },
      },
    },
    {
      $lookup: {
        from: Invoice.collection.name,
        localField: "invoice",
        foreignField: "_id",
        as: "inv",
      },
    },
    { $unwind: "$inv" },
    { $match: { "inv.group": gid, "inv.isDeleted": { $ne: true } } },
    {
      $group: {
        _id: "$type",
        sum: { $sum: "$amount" },
      },
    },
  ]);

  let payments = 0;
  let refunds = 0;
  for (const row of result) {
    if (row._id === "payment") payments = row.sum || 0;
    else if (row._id === "refund") refunds = row.sum || 0;
  }
  return Math.max(0, payments - refunds);
};

// Bitta guruh uchun maosh komponentlarini hisoblaydi
// Rate: TeacherGroupRate doc
// Group: Group doc (schedule kerak)
// Period: { year, month }
export const computeGroupBreakdown = async (rate, group, period) => {
  const { start, end } = monthRange(period.year, period.month);
  const monthLastIncl = new Date(end.getTime() - 1);

  // O'qituvchining shu oydagi faol davri: [effectiveFrom, effectiveTo) ∩ oy.
  // Almashtirilgan o'qituvchi faqat o'zi ishlagan davr darslari uchun pul oladi.
  const effFrom = rate.effectiveFrom ? new Date(rate.effectiveFrom) : start;
  let effToExcl = rate.effectiveTo ? new Date(rate.effectiveTo) : end;
  // Guruh yakunlangan/arxivlangan bo'lsa — finishedAt'dan keyin maosh hisoblanmaydi.
  // (finishedAt inclusive → eksklyuziv chegara = +1 kun). Maxraj (monthSessions) o'zgarmaydi,
  // shu sababli yakunlangan oy proratsiya bo'ladi, keyingi oylar 0 bo'ladi.
  if (group.finishedAt) {
    const groupEndExcl = new Date(
      toUtcMidnight(group.finishedAt).getTime() + 24 * 60 * 60 * 1000,
    );
    if (groupEndExcl < effToExcl) effToExcl = groupEndExcl;
  }
  const rangeStart = effFrom > start ? effFrom : start;
  const rangeEndExcl = effToExcl < end ? effToExcl : end;
  const isActiveInRange = rangeStart < rangeEndExcl;
  const rangeLastIncl = new Date(rangeEndExcl.getTime() - 1);

  // Dars kunlari: to'liq oy (proratsiya maxraji) va o'qituvchi davri
  const monthSessions = getClassDaysInRange(group, start, monthLastIncl).length;
  const classDays = isActiveInRange
    ? getClassDaysInRange(group, rangeStart, rangeLastIncl)
    : [];
  const sessionsCount = classDays.length;
  // fixed/per_student uchun ulush (o'tgan darslar nisbati).
  // Jadval yo'q (dars kuni 0) bo'lsa — davrida faol bo'lsa to'liq olinadi.
  const fraction =
    monthSessions > 0 ? sessionsCount / monthSessions : isActiveInRange ? 1 : 0;

  const hoursPerSession = rate.hoursPerSession || 0;
  const totalHours = sessionsCount * hoursPerSession;

  const t = rate.calculationType;
  const isMixed = t === "mixed";

  // fixed - o'qituvchi davridagi darslar ulushiga proratsiya qilinadi
  const fixedAmount =
    t === "fixed" || isMixed ? (rate.fixedAmount || 0) * fraction : 0;

  const hourlyAmount =
    (t === "hourly" || isMixed) && rate.hourlyRate > 0
      ? totalHours * rate.hourlyRate
      : 0;

  // percentage - faqat o'qituvchi davrida kelgan to'lovlardan
  let studentPaymentsTotal = 0;
  let percentageAmount = 0;
  if (
    (t === "percentage" || isMixed) &&
    rate.percentageRate > 0 &&
    isActiveInRange
  ) {
    studentPaymentsTotal = await aggregateGroupPayments(group._id, period, {
      start: rangeStart,
      end: rangeEndExcl,
    });
    percentageAmount = (studentPaymentsTotal * rate.percentageRate) / 100;
  }

  // Har bir o'quvchidan summa × faol o'quvchilar, davr ulushiga proratsiya
  let studentsCount = 0;
  let perStudentAmount = 0;
  if ((t === "per_student" || isMixed) && rate.amountPerStudent > 0) {
    studentsCount = await countActiveStudents(group._id);
    perStudentAmount = studentsCount * rate.amountPerStudent * fraction;
  }

  // Minimal kafolat o'qituvchining UMUMIY oyligiga qo'llanadi (service'da),
  // shuning uchun bu yerda subtotal = xom komponentlar yig'indisi
  const subtotal =
    fixedAmount + hourlyAmount + percentageAmount + perStudentAmount;

  return {
    group: group._id,
    groupName: group.name,
    calculationType: rate.calculationType,
    sessionsCount,
    hoursPerSession,
    totalHours,
    hourlyRate: rate.hourlyRate || 0,
    hourlyAmount: Math.round(hourlyAmount),
    fixedAmount: Math.round(fixedAmount),
    studentPaymentsTotal: Math.round(studentPaymentsTotal),
    percentageRate: rate.percentageRate || 0,
    percentageAmount: Math.round(percentageAmount),
    studentsCount,
    amountPerStudent: Math.round(rate.amountPerStudent || 0),
    perStudentAmount: Math.round(perStudentAmount),
    minMonthlyAmount: Math.round(rate.minMonthlyAmount || 0),
    subtotal: Math.round(subtotal),
  };
};

// Adjustments asosida totals va finalAmount qayta hisoblash
export const recomputeFinal = (salary) => {
  let bonus = 0;
  let penalty = 0;
  let advance = 0;
  let deduction = 0;
  for (const a of salary.adjustments || []) {
    if (a.type === "bonus") bonus += a.amount;
    else if (a.type === "penalty") penalty += a.amount;
    else if (a.type === "advance") advance += a.amount;
    else if (a.type === "deduction") deduction += a.amount;
  }
  salary.bonusTotal = Math.round(bonus);
  salary.penaltyTotal = Math.round(penalty);
  salary.advanceTotal = Math.round(advance);
  salary.deductionTotal = Math.round(deduction);
  const final =
    (salary.baseAmount || 0) +
    salary.bonusTotal -
    salary.penaltyTotal -
    salary.advanceTotal -
    salary.deductionTotal;
  salary.finalAmount = Math.max(0, Math.round(final));
  return salary;
};

export const assertCanRecompute = (salary) => {
  if (salary.status === "paid") {
    throw new ApiError(
      409,
      "To'liq to'langan oylikni qayta hisoblash mumkin emas",
    );
  }
  if (salary.status === "cancelled") {
    throw new ApiError(
      409,
      "Bekor qilingan oylikni qayta hisoblash mumkin emas",
    );
  }
};

export const assertCanReceivePayout = (salary) => {
  // Tasdiqlash shart emas - hisoblangan oylik ham to'g'ridan-to'g'ri to'lanadi
  if (salary.status === "paid") {
    throw new ApiError(409, "Oylik allaqachon to'liq to'langan");
  }
  if (salary.status === "cancelled") {
    throw new ApiError(409, "Bekor qilingan oylikga to'lov kiritib bo'lmaydi");
  }
  // Ortiqcha to'lovga ruxsat: ortiqcha qism keyingi oy avansiga yoziladi
};

// Payouts ro'yxatidan paidAmount va status hisoblash
export const computePaymentStatus = (finalAmount, paidAmount) => {
  if (paidAmount <= 0) return "approved";
  if (paidAmount + 0.01 >= finalAmount) return "paid";
  return "partial";
};
