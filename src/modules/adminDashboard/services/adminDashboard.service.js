import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Invoice from "../../../models/invoice.model.js";
import Payment from "../../../models/payment.model.js";
import Attendance from "../../../models/attendance.model.js";
import LeadDirection from "../../../models/leadDirection.model.js";
import { ROLES } from "../../../constants/roles.js";

import * as paymentReports from "../../paymentReports/services/paymentReports.service.js";
import * as expenses from "../../expenses/services/expenses.service.js";
import * as leads from "../../leads/services/leads.service.js";

// === Sana yordamchilari (UTC) ===
const monthRange = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
};

const todayRange = () => {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { start, end };
};

const previousMonths = (count) => {
  const now = new Date();
  const arr = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    arr.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return arr;
};

// === Atomic helpers ===
const sumPaymentsInRange = async (start, end) => {
  const result = await Payment.aggregate([
    {
      $match: {
        paidAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: "$type",
        sum: { $sum: "$amount" },
      },
    },
  ]);
  let payments = 0;
  let refunds = 0;
  for (const r of result) {
    if (r._id === "payment") payments = r.sum || 0;
    else if (r._id === "refund") refunds = r.sum || 0;
  }
  return Math.max(0, payments - refunds);
};

const computeTodayAttendanceRate = async () => {
  const { start, end } = todayRange();
  const result = await Attendance.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
  const counts = { present: 0, late: 0, excused: 0, absent: 0, exempt: 0 };
  for (const r of result) {
    counts[r._id] = r.count || 0;
  }
  const denom =
    counts.present + counts.late + counts.excused + counts.absent;
  if (denom === 0) return null;
  const numerator = counts.present + counts.late;
  return Math.round((numerator / denom) * 100);
};

const computeCurrentMonthDebt = async (year, month) => {
  const result = await Invoice.aggregate([
    {
      $match: {
        "period.year": Number(year),
        "period.month": Number(month),
        status: { $in: ["unpaid", "partial"] },
      },
    },
    {
      $group: {
        _id: null,
        debt: { $sum: { $subtract: ["$totalDue", "$paidAmount"] } },
      },
    },
  ]);
  return result[0]?.debt || 0;
};

const computeMostPopularDirection = async () => {
  // Faol talabalar joylashgan guruhlar bo'yicha groupBy direction
  const result = await GroupMembership.aggregate([
    { $match: { leftAt: null } },
    {
      $lookup: {
        from: Group.collection.name,
        localField: "group",
        foreignField: "_id",
        as: "group",
      },
    },
    { $unwind: "$group" },
    { $match: { "group.isActive": true } },
    {
      $group: {
        _id: "$group.direction",
        studentsCount: { $sum: 1 },
      },
    },
    { $sort: { studentsCount: -1 } },
    { $limit: 1 },
    {
      $lookup: {
        from: LeadDirection.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "direction",
      },
    },
    { $unwind: { path: "$direction", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        directionId: "$_id",
        name: { $ifNull: ["$direction.name", "Ko'rsatilmagan"] },
        studentsCount: 1,
      },
    },
  ]);
  return result[0] || null;
};

const DAY_LABELS = ["Yak", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

const computeWeekdayActivity = async () => {
  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 30,
      0,
      0,
      0,
      0,
    ),
  );

  const result = await Attendance.aggregate([
    { $match: { date: { $gte: start } } },
    {
      $group: {
        _id: { $dayOfWeek: "$date" }, // 1=Yak, 2=Du, ... 7=Sh (Mongo)
        count: { $sum: 1 },
      },
    },
  ]);

  // Mongo dayOfWeek 1-7 (Sunday=1) → JS 0-6 (Sunday=0)
  const counts = new Array(7).fill(0);
  for (const r of result) {
    counts[(r._id - 1) % 7] = r.count;
  }
  // Du-Ya tartibida qaytaramiz
  const order = [1, 2, 3, 4, 5, 6, 0]; // Du, Se, ..., Yak
  return order.map((idx) => ({
    day: DAY_LABELS[idx],
    lessonsCount: counts[idx],
  }));
};

// === Asosiy: getOverview ===
export const getOverview = async ({ year, month } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;
  const { start, end } = monthRange(y, m);

  const [
    paymentSummary,
    expenseStats,
    studentsCount,
    teachersCount,
    activeGroupsCount,
    leadStats,
    todayAttendanceRate,
    currentMonthDebt,
    newStudentsThisMonth,
    lostStudentsThisMonth,
    mostPopularDirection,
    weekdayActivity,
  ] = await Promise.all([
    paymentReports.summary({ year: y, month: m }),
    expenses.getStats({ fromDate: start, toDate: end }),
    User.countDocuments({ role: ROLES.STUDENT, isActive: true }),
    User.countDocuments({ role: ROLES.TEACHER, isActive: true }),
    Group.countDocuments({ isActive: true }),
    leads.getDashboardStats({ fromDate: start, toDate: end }),
    computeTodayAttendanceRate(),
    computeCurrentMonthDebt(y, m),
    GroupMembership.countDocuments({
      joinedAt: { $gte: start, $lte: end },
    }),
    GroupMembership.countDocuments({
      leftAt: { $gte: start, $lte: end },
    }),
    computeMostPopularDirection(),
    computeWeekdayActivity(),
  ]);

  const income = paymentSummary?.collected || 0;
  const expensesTotal = expenseStats?.total || 0;

  return {
    period: { year: y, month: m },
    income,
    incomeOwed: paymentSummary?.outstanding || 0,
    plannedIncome: paymentSummary?.planned || 0,
    expenses: expensesTotal,
    netProfit: income - expensesTotal,
    studentsCount,
    teachersCount,
    activeGroupsCount,
    leadsConversion: {
      total: leadStats?.total || 0,
      converted: leadStats?.totalConverted || 0,
      rate: leadStats?.conversionRate || 0,
    },
    todayAttendanceRate,
    currentMonthDebt,
    newStudentsThisMonth,
    lostStudentsThisMonth,
    mostPopularDirection,
    weekdayActivity,
  };
};

// === getMonthlyFinancials ===
export const getMonthlyFinancials = async ({ months = 6 } = {}) => {
  const periods = previousMonths(months);
  const result = [];
  for (const p of periods) {
    const { start, end } = monthRange(p.year, p.month);
    const [income, expensesSum] = await Promise.all([
      sumPaymentsInRange(start, end),
      expenses.sumInRange(start, end),
    ]);
    result.push({
      year: p.year,
      month: p.month,
      income,
      expenses: expensesSum,
      netProfit: income - expensesSum,
    });
  }
  return result;
};

// === getIncomeByDirection ===
export const getIncomeByDirection = async ({ year, month } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;

  const rows = await Invoice.aggregate([
    {
      $match: {
        "period.year": y,
        "period.month": m,
        status: { $ne: "cancelled" },
      },
    },
    {
      $lookup: {
        from: Group.collection.name,
        localField: "group",
        foreignField: "_id",
        as: "group",
      },
    },
    { $unwind: { path: "$group", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: "$group.direction",
        invoicesCount: { $sum: 1 },
        totalDue: { $sum: "$totalDue" },
        paidAmount: { $sum: "$paidAmount" },
      },
    },
    {
      $lookup: {
        from: LeadDirection.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "direction",
      },
    },
    { $unwind: { path: "$direction", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        directionId: "$_id",
        name: { $ifNull: ["$direction.name", "Ko'rsatilmagan"] },
        invoicesCount: 1,
        totalDue: 1,
        paidAmount: 1,
        outstanding: { $subtract: ["$totalDue", "$paidAmount"] },
      },
    },
    { $sort: { paidAmount: -1 } },
  ]);

  return rows;
};

// === getIncomeByTeacher ===
export const getIncomeByTeacher = async ({ year, month } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;

  const rows = await Invoice.aggregate([
    {
      $match: {
        "period.year": y,
        "period.month": m,
        status: { $ne: "cancelled" },
      },
    },
    {
      $lookup: {
        from: Group.collection.name,
        localField: "group",
        foreignField: "_id",
        as: "group",
      },
    },
    { $unwind: { path: "$group", preserveNullAndEmptyArrays: true } },
    {
      $unwind: {
        path: "$group.teachers",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: "$group.teachers",
        invoicesCount: { $sum: 1 },
        totalDue: { $sum: "$totalDue" },
        paidAmount: { $sum: "$paidAmount" },
      },
    },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "teacher",
      },
    },
    { $unwind: { path: "$teacher", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        teacherId: "$_id",
        firstName: { $ifNull: ["$teacher.firstName", ""] },
        lastName: { $ifNull: ["$teacher.lastName", ""] },
        invoicesCount: 1,
        totalDue: 1,
        paidAmount: 1,
        outstanding: { $subtract: ["$totalDue", "$paidAmount"] },
      },
    },
    { $sort: { paidAmount: -1 } },
  ]);

  // teacher=null bo'lsa "Biriktirilmagan" deb belgilash
  return rows.map((r) =>
    r.teacherId
      ? r
      : { ...r, firstName: "Biriktirilmagan", lastName: "" },
  );
};

// === getStudentFlow ===
export const getStudentFlow = async ({ months = 6 } = {}) => {
  const periods = previousMonths(months);
  const result = [];
  for (const p of periods) {
    const { start, end } = monthRange(p.year, p.month);
    const [joined, left] = await Promise.all([
      GroupMembership.countDocuments({
        joinedAt: { $gte: start, $lte: end },
      }),
      GroupMembership.countDocuments({
        leftAt: { $gte: start, $lte: end },
      }),
    ]);
    result.push({
      year: p.year,
      month: p.month,
      joined,
      left,
      netGrowth: joined - left,
    });
  }
  return result;
};

// === forecastNextMonth (sodda baseline) ===
export const forecastNextMonth = async () => {
  const months = await getMonthlyFinancials({ months: 3 });
  if (months.length < 3) return null;

  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const avgIncome = Math.round(avg(months.map((m) => m.income)));
  const avgExpenses = Math.round(avg(months.map((m) => m.expenses)));

  const now = new Date();
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return {
    period: {
      year: nextMonth.getUTCFullYear(),
      month: nextMonth.getUTCMonth() + 1,
    },
    income: avgIncome,
    expenses: avgExpenses,
    netProfit: avgIncome - avgExpenses,
    basedOn: months.length,
  };
};
