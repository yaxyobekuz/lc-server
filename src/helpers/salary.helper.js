// Salary helper - period range, group breakdown computation, payment aggregation
import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import Invoice from "../models/invoice.model.js";
import ApiError from "../utils/ApiError.js";
import { getClassDaysInRange } from "./attendance.helper.js";

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

// Shu guruh va vaqt diapazonida talabalardan kelgan to'lovlar yig'indisi
// (`payment` − `refund`). Cash-flow asosida.
export const aggregateGroupPayments = async (groupId, period) => {
  const { start, end } = monthRange(period.year, period.month);
  const gid = new mongoose.Types.ObjectId(String(groupId));

  // Payment + Invoice join (Invoice.group = G)
  const result = await Payment.aggregate([
    {
      $match: {
        paidAt: { $gte: start, $lt: end },
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
    { $match: { "inv.group": gid } },
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
  // Class days - schedule asosida (oxirgi sana ekskluziv, shuning uchun -1ms)
  const lastIncl = new Date(end.getTime() - 1);
  const classDays = getClassDaysInRange(group, start, lastIncl);
  const sessionsCount = classDays.length;

  const hoursPerSession = rate.hoursPerSession || 0;
  const totalHours = sessionsCount * hoursPerSession;

  const fixedAmount =
    rate.calculationType === "fixed" || rate.calculationType === "mixed"
      ? rate.fixedAmount || 0
      : 0;

  const hourlyAmount =
    (rate.calculationType === "hourly" || rate.calculationType === "mixed") &&
    rate.hourlyRate > 0
      ? totalHours * rate.hourlyRate
      : 0;

  let studentPaymentsTotal = 0;
  let percentageAmount = 0;
  if (
    (rate.calculationType === "percentage" ||
      rate.calculationType === "mixed") &&
    rate.percentageRate > 0
  ) {
    studentPaymentsTotal = await aggregateGroupPayments(group._id, period);
    percentageAmount = (studentPaymentsTotal * rate.percentageRate) / 100;
  }

  const componentSum = fixedAmount + hourlyAmount + percentageAmount;
  const minMonthlyAmount = rate.minMonthlyAmount || 0;
  const subtotal = Math.max(componentSum, minMonthlyAmount);

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
    minMonthlyAmount: Math.round(minMonthlyAmount),
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

export const assertCanReceivePayout = (salary, amount) => {
  if (salary.status === "calculated") {
    throw new ApiError(409, "Avval oylikni tasdiqlang");
  }
  if (salary.status === "paid") {
    throw new ApiError(409, "Oylik allaqachon to'liq to'langan");
  }
  if (salary.status === "cancelled") {
    throw new ApiError(409, "Bekor qilingan oylikga to'lov kiritib bo'lmaydi");
  }
  const remaining = (salary.finalAmount || 0) - (salary.paidAmount || 0);
  if (amount > remaining + 0.01) {
    throw new ApiError(400, "To'lov summasi qoldiqdan oshib ketdi");
  }
};

// Payouts ro'yxatidan paidAmount va status hisoblash
export const computePaymentStatus = (finalAmount, paidAmount) => {
  if (paidAmount <= 0) return "approved";
  if (paidAmount + 0.01 >= finalAmount) return "paid";
  return "partial";
};
