import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Attendance from "../../../models/attendance.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import Lead from "../../../models/lead.model.js";
import { ROLES } from "../../../constants/roles.js";

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

// === Bugungi davomat taqsimoti (gauge uchun) ===
const computeAttendanceGauge = async () => {
  const { start, end } = todayRange();
  const result = await Attendance.aggregate([
    { $match: { date: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = { present: 0, late: 0, excused: 0, absent: 0, exempt: 0 };
  for (const r of result) counts[r._id] = r.count || 0;

  // Yagona ta'rif: maxraj = present + absent + late (exempt va excused tashqarida)
  const denom = counts.present + counts.late + counts.absent;
  const rate = denom === 0 ? null : Math.round(((counts.present + counts.late) / denom) * 100);
  return {
    rate,
    present: counts.present,
    late: counts.late,
    absent: counts.absent,
    total: denom,
  };
};

const DAY_LABELS = ["Yak", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

// So'nggi 30 kun ichida har hafta kunidagi dars (davomat yozuvi) soni - bar chart.
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
    { $match: { date: { $gte: start }, isDeleted: { $ne: true } } },
    { $group: { _id: { $dayOfWeek: "$date" }, count: { $sum: 1 } } },
  ]);

  const counts = new Array(7).fill(0);
  for (const r of result) counts[(r._id - 1) % 7] = r.count;
  // Du-Yak tartibida qaytaramiz
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((idx) => ({ day: DAY_LABELS[idx], lessonsCount: counts[idx] }));
};

// Oylik kirim (to'lov tranzaksiyalari yig'indisi)
const computeRevenue = async (start, end) => {
  const [row] = await PaymentTransaction.aggregate([
    { $match: { paidAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  return { total: row?.total || 0, count: row?.count || 0 };
};

// So'nggi to'lovlar ro'yxati (reference: "Project" ro'yxati)
const computeRecentPayments = async () => {
  const rows = await PaymentTransaction.find({ isDeleted: { $ne: true } })
    .sort({ paidAt: -1 })
    .limit(5)
    .populate("student", "firstName lastName")
    .populate("group", "name")
    .lean();
  return rows.map((r) => ({
    id: String(r._id),
    studentName: r.student
      ? `${r.student.firstName} ${r.student.lastName || ""}`.trim()
      : "Noma'lum",
    groupName: r.group?.name || "-",
    amount: r.amount,
    method: r.method,
    paidAt: r.paidAt,
  }));
};

// Eng faol o'qituvchilar - faol guruhlardagi o'quvchilar soni bo'yicha (reference: "Team Collaboration")
const computeTopTeachers = async () => {
  const rows = await Group.aggregate([
    { $match: { isActive: true, isDeleted: { $ne: true } } },
    { $unwind: "$teachers" },
    {
      $lookup: {
        from: "groupmemberships",
        let: { gid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$group", "$$gid"] },
              leftAt: null,
              isDeleted: { $ne: true },
            },
          },
          { $count: "n" },
        ],
        as: "members",
      },
    },
    {
      $group: {
        _id: "$teachers",
        groupsCount: { $sum: 1 },
        studentsCount: { $sum: { $ifNull: [{ $arrayElemAt: ["$members.n", 0] }, 0] } },
      },
    },
    { $sort: { studentsCount: -1, groupsCount: -1 } },
    { $limit: 4 },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "teacher",
      },
    },
    { $unwind: "$teacher" },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: { $trim: { input: { $concat: ["$teacher.firstName", " ", { $ifNull: ["$teacher.lastName", ""] }] } } },
        groupsCount: 1,
        studentsCount: 1,
      },
    },
  ]);
  return rows;
};

// === Asosiy: getOverview ===
export const getOverview = async ({ year, month } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;
  const { start, end } = monthRange(y, m);
  const prev = monthRange(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);

  const [
    studentsCount,
    teachersCount,
    activeGroupsCount,
    newStudentsThisMonth,
    lostStudentsThisMonth,
    newLeadsThisMonth,
    pendingLeads,
    revenueThisMonth,
    revenueLastMonth,
    attendanceGauge,
    weekdayActivity,
    recentPayments,
    topTeachers,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.STUDENT, isActive: true, isDeleted: { $ne: true } }),
    User.countDocuments({ role: ROLES.TEACHER, isActive: true, isDeleted: { $ne: true } }),
    Group.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
    GroupMembership.countDocuments({ joinedAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } }),
    GroupMembership.countDocuments({ leftAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } }),
    Lead.countDocuments({ createdAt: { $gte: start, $lte: end } }),
    Lead.countDocuments({ status: { $in: ["new", "info_given", "trial"] } }),
    computeRevenue(start, end),
    computeRevenue(prev.start, prev.end),
    computeAttendanceGauge(),
    computeWeekdayActivity(),
    computeRecentPayments(),
    computeTopTeachers(),
  ]);

  // O'zgarish foizi (o'tgan oyga nisbatan kirim)
  const revenueDelta =
    revenueLastMonth.total > 0
      ? Math.round(((revenueThisMonth.total - revenueLastMonth.total) / revenueLastMonth.total) * 100)
      : null;

  return {
    period: { year: y, month: m },
    studentsCount,
    teachersCount,
    activeGroupsCount,
    newStudentsThisMonth,
    lostStudentsThisMonth,
    netGrowth: newStudentsThisMonth - lostStudentsThisMonth,
    newLeadsThisMonth,
    pendingLeads,
    revenueThisMonth: revenueThisMonth.total,
    revenueLastMonth: revenueLastMonth.total,
    paymentsCount: revenueThisMonth.count,
    revenueDelta,
    attendanceGauge,
    todayAttendanceRate: attendanceGauge.rate,
    weekdayActivity,
    recentPayments,
    topTeachers,
  };
};

// === getStudentFlow (o'quvchilar oqimi - oylik) ===
export const getStudentFlow = async ({ months = 6 } = {}) => {
  const periods = previousMonths(months);
  const result = [];
  for (const p of periods) {
    const { start, end } = monthRange(p.year, p.month);
    const [joined, left] = await Promise.all([
      GroupMembership.countDocuments({ joinedAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } }),
      GroupMembership.countDocuments({ leftAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } }),
    ]);
    result.push({ year: p.year, month: p.month, joined, left, netGrowth: joined - left });
  }
  return result;
};

// === getCashflow (moliyaviy kirim/chiqim bar chart) ===
// range: "week" | "month" -> kunlik buckets, "year" -> oylik buckets.
// Kirim = PaymentTransaction (o'quvchi to'lovlari), Chiqim = SalaryTransaction (maoshlar).
const sumByDay = async (Model, start, end) => {
  const rows = await Model.aggregate([
    { $match: { paidAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt", timezone: "UTC" } },
        total: { $sum: "$amount" },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) map.set(r._id, r.total);
  return map;
};

const sumByMonth = async (Model, start, end) => {
  const rows = await Model.aggregate([
    { $match: { paidAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    { $group: { _id: { $month: { date: "$paidAt", timezone: "UTC" } }, total: { $sum: "$amount" } } },
  ]);
  const map = new Map();
  for (const r of rows) map.set(r._id, r.total);
  return map;
};

const DAY_SHORT = ["Yak", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
const MONTH_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];

export const getCashflow = async ({ range = "month" } = {}) => {
  const now = new Date();
  const y = now.getUTCFullYear();

  if (range === "year") {
    const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    const [income, expense] = await Promise.all([
      sumByMonth(PaymentTransaction, start, end),
      sumByMonth(SalaryTransaction, start, end),
    ]);
    const buckets = [];
    for (let m = 1; m <= 12; m += 1) {
      buckets.push({
        label: MONTH_SHORT[m - 1],
        income: income.get(m) || 0,
        expense: expense.get(m) || 0,
      });
    }
    return { range, buckets };
  }

  // week | month -> kunlik buckets
  let start;
  let end;
  if (range === "week") {
    // Joriy hafta (Dushanba -> Yakshanba)
    const dow = now.getUTCDay() || 7; // Yak=7
    start = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate() - (dow - 1), 0, 0, 0, 0));
    end = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate() - (dow - 1) + 6, 23, 59, 59, 999));
  } else {
    // Joriy oy
    start = new Date(Date.UTC(y, now.getUTCMonth(), 1, 0, 0, 0, 0));
    end = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  }

  const [income, expense] = await Promise.all([
    sumByDay(PaymentTransaction, start, end),
    sumByDay(SalaryTransaction, start, end),
  ]);

  const buckets = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    const label =
      range === "week"
        ? DAY_SHORT[cursor.getUTCDay()]
        : String(cursor.getUTCDate());
    buckets.push({
      label,
      income: income.get(key) || 0,
      expense: expense.get(key) || 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { range, buckets };
};
