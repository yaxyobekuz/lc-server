import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Attendance from "../../../models/attendance.model.js";
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

// === Atomic helpers ===
const computeTodayAttendanceRate = async () => {
  const { start, end } = todayRange();
  const result = await Attendance.aggregate([
    { $match: { date: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
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
  // Yagona ta'rif: maxraj = present + absent + late (exempt va excused tashqarida)
  const denom = counts.present + counts.late + counts.absent;
  if (denom === 0) return null;
  const numerator = counts.present + counts.late;
  return Math.round((numerator / denom) * 100);
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
    { $match: { date: { $gte: start }, isDeleted: { $ne: true } } },
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
    studentsCount,
    teachersCount,
    activeGroupsCount,
    todayAttendanceRate,
    newStudentsThisMonth,
    lostStudentsThisMonth,
    weekdayActivity,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.STUDENT, isActive: true, isDeleted: { $ne: true } }),
    User.countDocuments({ role: ROLES.TEACHER, isActive: true, isDeleted: { $ne: true } }),
    Group.countDocuments({ isActive: true, isDeleted: { $ne: true } }),
    computeTodayAttendanceRate(),
    GroupMembership.countDocuments({
      joinedAt: { $gte: start, $lte: end },
      isDeleted: { $ne: true },
    }),
    GroupMembership.countDocuments({
      leftAt: { $gte: start, $lte: end },
      isDeleted: { $ne: true },
    }),
    computeWeekdayActivity(),
  ]);

  return {
    period: { year: y, month: m },
    studentsCount,
    teachersCount,
    activeGroupsCount,
    todayAttendanceRate,
    newStudentsThisMonth,
    lostStudentsThisMonth,
    weekdayActivity,
  };
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
        isDeleted: { $ne: true },
      }),
      GroupMembership.countDocuments({
        leftAt: { $gte: start, $lte: end },
        isDeleted: { $ne: true },
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
