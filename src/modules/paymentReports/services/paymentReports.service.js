import mongoose from "mongoose";
import Invoice from "../../../models/invoice.model.js";
import Payment from "../../../models/payment.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";

const NON_CANCELLED = { $ne: "cancelled" };

const startOfMonth = (year, month) =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
const endOfMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
const startOfDay = (d) => {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
};
const endOfDay = (d) => {
  const x = new Date(d);
  return new Date(
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), 23, 59, 59, 999),
  );
};

// {year, month} davri uchun: planned (jami invoyslar summasi) + collected (shu oy ichidagi to'lovlar net) +
// outstanding + percent + methodBreakdown
export const summary = async ({ year, month }) => {
  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);

  const [plannedAgg, paymentAgg, refundAgg, methodAgg] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          "period.year": Number(year),
          "period.month": Number(month),
          status: NON_CANCELLED,
        },
      },
      { $group: { _id: null, sum: { $sum: "$totalDue" } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          type: "payment",
          paidAt: { $gte: monthStart, $lte: monthEnd },
        },
      },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      {
        $match: {
          type: "refund",
          paidAt: { $gte: monthStart, $lte: monthEnd },
        },
      },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ]),
    Payment.aggregate([
      { $match: { paidAt: { $gte: monthStart, $lte: monthEnd } } },
      {
        $group: {
          _id: { method: "$method", type: "$type" },
          sum: { $sum: "$amount" },
        },
      },
      {
        $lookup: {
          from: "paymentmethods",
          localField: "_id.method",
          foreignField: "_id",
          as: "method",
        },
      },
      { $unwind: { path: "$method", preserveNullAndEmptyArrays: true } },
    ]),
  ]);

  const planned = plannedAgg[0]?.sum || 0;
  const paid = paymentAgg[0]?.sum || 0;
  const refunded = refundAgg[0]?.sum || 0;
  const collected = Math.max(0, paid - refunded);
  const outstanding = Math.max(0, planned - collected);
  const percent = planned > 0 ? Math.round((collected / planned) * 100) : 0;

  // Method breakdown'ni jamlash (signed)
  const methodMap = new Map();
  for (const row of methodAgg) {
    const id = String(row._id?.method || "");
    const sign = row._id?.type === "refund" ? -1 : 1;
    const cur = methodMap.get(id) || {
      methodId: row._id?.method || null,
      methodName: row.method?.name || "Noma'lum",
      amount: 0,
    };
    cur.amount += (Number(row.sum) || 0) * sign;
    methodMap.set(id, cur);
  }
  const methodBreakdown = Array.from(methodMap.values())
    .map((m) => ({ ...m, amount: Math.max(0, m.amount) }))
    .sort((a, b) => b.amount - a.amount);

  return { planned, collected, outstanding, percent, methodBreakdown };
};

// Har bir guruh bo'yicha {planned, collected, paidStudents, totalStudents, percent}
export const groupStats = async ({ year, month }) => {
  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);

  const items = await Invoice.aggregate([
    {
      $match: {
        "period.year": Number(year),
        "period.month": Number(month),
        status: NON_CANCELLED,
      },
    },
    {
      $group: {
        _id: "$group",
        planned: { $sum: "$totalDue" },
        collected: { $sum: "$paidAmount" },
        totalStudents: { $sum: 1 },
        paidStudents: {
          $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
        },
      },
    },
    {
      $lookup: {
        from: "groups",
        localField: "_id",
        foreignField: "_id",
        as: "group",
      },
    },
    { $unwind: "$group" },
    {
      $project: {
        _id: 0,
        groupId: "$_id",
        name: "$group.name",
        planned: 1,
        collected: 1,
        outstanding: { $max: [0, { $subtract: ["$planned", "$collected"] }] },
        totalStudents: 1,
        paidStudents: 1,
        percent: {
          $cond: [
            { $gt: ["$planned", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$collected", "$planned"] }, 100] },
                0,
              ],
            },
            0,
          ],
        },
      },
    },
    { $sort: { name: 1 } },
  ]);

  return items;
};

export const topDebtors = async ({ limit = 10 }) => {
  const items = await Invoice.aggregate([
    { $match: { status: { $in: ["unpaid", "partial"] } } },
    {
      $group: {
        _id: "$student",
        debt: { $sum: { $subtract: ["$totalDue", "$paidAmount"] } },
        invoicesCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: "$student" },
    {
      $project: {
        _id: 0,
        studentId: "$_id",
        firstName: "$student.firstName",
        lastName: "$student.lastName",
        phone: "$student.phone",
        debt: 1,
        invoicesCount: 1,
      },
    },
    { $sort: { debt: -1 } },
    { $limit: Number(limit) || 10 },
  ]);
  return items;
};

export const topPayers = async ({ limit = 10 }) => {
  // Oxirgi 12 oy bo'yicha
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 12);

  const items = await Payment.aggregate([
    { $match: { paidAt: { $gte: since } } },
    {
      $group: {
        _id: { student: "$student", type: "$type" },
        sum: { $sum: "$amount" },
      },
    },
    {
      $group: {
        _id: "$_id.student",
        paid: {
          $sum: { $cond: [{ $eq: ["$_id.type", "payment"] }, "$sum", 0] },
        },
        refunded: {
          $sum: { $cond: [{ $eq: ["$_id.type", "refund"] }, "$sum", 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        studentId: "$_id",
        net: { $max: [0, { $subtract: ["$paid", "$refunded"] }] },
      },
    },
    { $sort: { net: -1 } },
    { $limit: Number(limit) || 10 },
    {
      $lookup: {
        from: "users",
        localField: "studentId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: "$student" },
    {
      $project: {
        studentId: 1,
        net: 1,
        firstName: "$student.firstName",
        lastName: "$student.lastName",
        phone: "$student.phone",
      },
    },
  ]);
  return items;
};

export const monthlyTrend = async ({ months = 12 }) => {
  const n = Math.min(36, Math.max(1, Number(months) || 12));
  const now = new Date();
  const result = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const s = await summary({ year, month });
    result.push({
      period: { year, month },
      planned: s.planned,
      collected: s.collected,
    });
  }
  return result;
};

export const daily = async ({ date }) => {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const items = await Payment.aggregate([
    { $match: { paidAt: { $gte: dayStart, $lte: dayEnd } } },
    {
      $group: {
        _id: { method: "$method", type: "$type" },
        sum: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "paymentmethods",
        localField: "_id.method",
        foreignField: "_id",
        as: "method",
      },
    },
    { $unwind: { path: "$method", preserveNullAndEmptyArrays: true } },
  ]);

  // Method bo'yicha jamlash (signed)
  const map = new Map();
  let totalIn = 0;
  let totalRefund = 0;
  for (const row of items) {
    const id = String(row._id?.method || "");
    const sign = row._id?.type === "refund" ? -1 : 1;
    const cur = map.get(id) || {
      methodId: row._id?.method || null,
      methodName: row.method?.name || "Noma'lum",
      amount: 0,
      count: 0,
    };
    cur.amount += (Number(row.sum) || 0) * sign;
    cur.count += row.count;
    map.set(id, cur);
    if (sign > 0) totalIn += Number(row.sum) || 0;
    else totalRefund += Number(row.sum) || 0;
  }

  return {
    date: dayStart,
    total: Math.max(0, totalIn - totalRefund),
    paymentsCount: Array.from(map.values()).reduce((s, m) => s + m.count, 0),
    methods: Array.from(map.values())
      .map((m) => ({ ...m, amount: Math.max(0, m.amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
};
