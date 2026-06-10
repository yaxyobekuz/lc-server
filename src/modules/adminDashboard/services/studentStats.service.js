import User from "../../../models/user.model.js";
import { ROLES } from "../../../constants/roles.js";

// === Sana yordamchilari (UTC) ===
// O'tgan `count` oyni [{year, month}] ko'rinishida (eng eskisidan boshlab).
const previousMonths = (count) => {
  const now = new Date();
  const arr = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    arr.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return arr;
};

const monthStart = (year, month) =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));

// Faol o'quvchilar uchun asosiy filtr (yagona joyda).
const ACTIVE_STUDENT_FILTER = {
  role: ROLES.STUDENT,
  isActive: true,
  isDeleted: { $ne: true },
  enrolledAt: { $ne: null },
};

// Ro'yxatga olinish davomiyligiga ko'ra guruhlash chegaralari (oyda).
// [min, max) - max=null cheksiz. Tartib UI'da shu tartibda chiqadi.
const DURATION_BUCKETS = [
  { key: "0-3", label: "0-3 oy", minMonths: 0, maxMonths: 3 },
  { key: "3-6", label: "3-6 oy", minMonths: 3, maxMonths: 6 },
  { key: "6-12", label: "6-12 oy", minMonths: 6, maxMonths: 12 },
  { key: "12+", label: "1 yildan ortiq", minMonths: 12, maxMonths: null },
];

// === Atomic helpers ===

// Oylar bo'yicha yangi ro'yxatga olishlar (enrolledAt) - trend grafigi uchun.
const computeEnrollmentTrend = async (months) => {
  const periods = previousMonths(months);
  const rangeStart = monthStart(periods[0].year, periods[0].month);

  const rows = await User.aggregate([
    { $match: { ...ACTIVE_STUDENT_FILTER, enrolledAt: { $gte: rangeStart } } },
    {
      $group: {
        _id: {
          year: { $year: "$enrolledAt" },
          month: { $month: "$enrolledAt" },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  // Bo'sh oylarni 0 bilan to'ldiramiz (grafikda uzilish bo'lmasligi uchun).
  const map = new Map();
  for (const r of rows) {
    map.set(`${r._id.year}-${r._id.month}`, r.count);
  }
  return periods.map((p) => ({
    year: p.year,
    month: p.month,
    count: map.get(`${p.year}-${p.month}`) || 0,
  }));
};

// Davomiylik (oyda) bo'yicha kohortalar + o'rtacha davomiylik.
// $dateDiff bilan oylardagi farqni serverda hisoblaymiz (joriy sana - enrolledAt).
const computeDurationStats = async () => {
  const rows = await User.aggregate([
    { $match: ACTIVE_STUDENT_FILTER },
    {
      $project: {
        months: {
          $dateDiff: {
            startDate: "$enrolledAt",
            endDate: "$$NOW",
            unit: "month",
          },
        },
      },
    },
  ]);

  const counts = Object.fromEntries(DURATION_BUCKETS.map((b) => [b.key, 0]));
  let totalMonths = 0;
  for (const r of rows) {
    const m = Math.max(0, r.months || 0);
    totalMonths += m;
    const bucket = DURATION_BUCKETS.find(
      (b) => m >= b.minMonths && (b.maxMonths === null || m < b.maxMonths),
    );
    if (bucket) counts[bucket.key] += 1;
  }

  const total = rows.length;
  const cohorts = DURATION_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: counts[b.key],
  }));
  const avgDurationMonths = total ? Math.round((totalMonths / total) * 10) / 10 : 0;

  return { cohorts, avgDurationMonths, total };
};

// Eng so'nggi ro'yxatga olingan o'quvchilar.
const computeRecentEnrollments = async (limit) => {
  const items = await User.find(ACTIVE_STUDENT_FILTER)
    .select("firstName lastName username enrolledAt")
    .sort({ enrolledAt: -1 })
    .limit(limit)
    .lean();
  return items;
};

// === Asosiy: getStudentStats ===
export const getStudentStats = async ({ months = 12, recentLimit = 8 } = {}) => {
  const [activeCount, durationStats, enrollmentTrend, recentEnrollments] =
    await Promise.all([
      User.countDocuments(ACTIVE_STUDENT_FILTER),
      computeDurationStats(),
      computeEnrollmentTrend(months),
      computeRecentEnrollments(recentLimit),
    ]);

  return {
    activeCount,
    avgDurationMonths: durationStats.avgDurationMonths,
    cohorts: durationStats.cohorts,
    enrollmentTrend,
    recentEnrollments,
  };
};
