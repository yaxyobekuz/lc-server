import GroupMembership from "../../../models/groupMembership.model.js";
import User from "../../../models/user.model.js";

// O'quvchilarning guruhlarni tark etishi (churn) tahlili.
//
// Tushunchalar:
//  • "Tark etgan" = leftReason: "removed" (haqiqatan chiqib ketgan).
//    transferred = boshqa guruhga ko'chirildi (churn emas),
//    graduated   = kursni bitirdi (ijobiy, churn emas).
//  • Davomiylik = leftAt - joinedAt (oyda), ya'ni guruhda qancha o'qigani.
//  • Sabab = leftReasonTitle snapshot (yo'q bo'lsa "Sababsiz").
//
// Diapazon leftAt bo'yicha filtrlanadi (shu davrda chiqib ketganlar).

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_MONTH = 30.4375; // o'rtacha (365.25 / 12)

// Ikki sana orasidagi oy farqi (kasr bilan, davomiylik o'rtacha hisobi uchun).
const monthsBetween = (from, to) =>
  (new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY / DAYS_PER_MONTH;

// leftAt diapazon filtri (ixtiyoriy from/to).
const buildLeftRange = (fromDate, toDate) => {
  const range = {
    leftReason: "removed",
    leftAt: { $ne: null },
    isDeleted: { $ne: true },
  };
  if (fromDate || toDate) {
    range.leftAt = {};
    if (fromDate) range.leftAt.$gte = new Date(fromDate);
    if (toDate) range.leftAt.$lte = new Date(toDate);
  }
  return range;
};

// Tark etgan membershiplarni group(+teachers) va student bilan yuklaymiz.
const loadChurnedMemberships = async (fromDate, toDate) => {
  const rows = await GroupMembership.find(buildLeftRange(fromDate, toDate))
    .populate({ path: "group", select: "name teachers" })
    .populate({ path: "leftReasonDetail", select: "title isActive" })
    .lean();

  // group o'chirilgan bo'lsa (null) - tashlab yuboramiz.
  return rows.filter((m) => m.group && m.joinedAt && m.leftAt);
};

// Chiqib ketgan o'quvchilar ro'yxati (kartaga bosilganda modal'da ko'rsatish uchun).
// Har bir membership = bitta qator: o'quvchi, guruh, muddat, sabab, chiqqan sana.
export const getChurnedStudents = async ({ fromDate, toDate } = {}) => {
  const rows = await GroupMembership.find(buildLeftRange(fromDate, toDate))
    .populate({ path: "group", select: "name" })
    .populate({ path: "student", select: "firstName lastName username" })
    .sort({ leftAt: -1 })
    .lean();

  return rows
    .filter((m) => m.student && m.joinedAt && m.leftAt)
    .map((m) => ({
      membershipId: String(m._id),
      studentId: String(m.student._id),
      studentName: `${m.student.firstName} ${m.student.lastName}`,
      username: m.student.username,
      groupName: m.group?.name || "(o'chirilgan)",
      durationMonths:
        Math.round(monthsBetween(m.joinedAt, m.leftAt) * 10) / 10,
      reasonTitle: m.leftReasonTitle || "Sababsiz",
      leftAt: m.leftAt,
    }));
};

// O'rtacha / median davomiylikni hisoblaydi.
const summarizeDurations = (durations) => {
  if (durations.length === 0) return { avgMonths: 0, medianMonths: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((s, d) => s + d, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    avgMonths: Math.round((sum / sorted.length) * 10) / 10,
    medianMonths: Math.round(median * 10) / 10,
  };
};

// === Asosiy: getRetentionStats ===
export const getRetentionStats = async ({ fromDate, toDate } = {}) => {
  const memberships = await loadChurnedMemberships(fromDate, toDate);

  const allDurations = [];
  const byReason = new Map(); // title -> { reasonId, title, count, durations[] }
  const byTeacher = new Map(); // teacherId -> { teacherId, count, durations[], reasons: Map }

  for (const m of memberships) {
    const months = Math.max(0, monthsBetween(m.joinedAt, m.leftAt));
    allDurations.push(months);

    // --- Sabab bo'yicha ---
    const title = m.leftReasonTitle || "Sababsiz";
    const reasonId = m.leftReasonDetail?._id
      ? String(m.leftReasonDetail._id)
      : null;
    if (!byReason.has(title)) {
      byReason.set(title, { reasonId, title, count: 0, durations: [] });
    }
    const r = byReason.get(title);
    r.count += 1;
    r.durations.push(months);

    // --- O'qituvchi bo'yicha (guruhda bir nechta o'qituvchi bo'lsa har biriga) ---
    const teachers = m.group.teachers?.length ? m.group.teachers : [null];
    for (const t of teachers) {
      const key = t ? String(t) : "none";
      if (!byTeacher.has(key)) {
        byTeacher.set(key, {
          teacherId: t ? String(t) : null,
          count: 0,
          durations: [],
          reasons: new Map(),
        });
      }
      const tr = byTeacher.get(key);
      tr.count += 1;
      tr.durations.push(months);
      tr.reasons.set(title, (tr.reasons.get(title) || 0) + 1);
    }
  }

  const overall = summarizeDurations(allDurations);

  // Sabablar - count bo'yicha kamayuvchi.
  const reasons = [...byReason.values()]
    .map((r) => ({
      reasonId: r.reasonId,
      title: r.title,
      count: r.count,
      avgDurationMonths: summarizeDurations(r.durations).avgMonths,
    }))
    .sort((a, b) => b.count - a.count);

  // O'qituvchilar - count bo'yicha kamayuvchi (eng ko'p churn yuqorida).
  const teacherRows = [...byTeacher.values()]
    .map((t) => ({
      teacherId: t.teacherId,
      churnedCount: t.count,
      avgDurationMonths: summarizeDurations(t.durations).avgMonths,
      // Har o'qituvchi uchun eng ko'p uchragan sabab (top reason).
      topReasons: [...t.reasons.entries()]
        .map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    }))
    .sort((a, b) => b.churnedCount - a.churnedCount);

  // O'qituvchi ismlarini boyitamiz (bitta so'rovda).
  const teacherIds = teacherRows.map((t) => t.teacherId).filter(Boolean);
  const teacherDocs = teacherIds.length
    ? await User.find(
        { _id: { $in: teacherIds } },
        { firstName: 1, lastName: 1 },
      ).lean()
    : [];
  const nameMap = new Map(
    teacherDocs.map((u) => [String(u._id), `${u.firstName} ${u.lastName}`]),
  );
  const teachers = teacherRows.map((t) => ({
    ...t,
    teacherName: t.teacherId
      ? nameMap.get(t.teacherId) || "(o'chirilgan)"
      : "O'qituvchisiz",
  }));

  return {
    totalChurned: memberships.length,
    avgDurationMonths: overall.avgMonths,
    medianDurationMonths: overall.medianMonths,
    reasons,
    teachers,
    // Davomiylik kohortalari (qancha o'qib chiqishgan) - "4 oy o'qib chiqyapti" misoli.
    durationBuckets: buildDurationBuckets(allDurations),
  };
};

// Tark etishdan oldin qancha o'qishgan - kohortalar.
const buildDurationBuckets = (durations) => {
  const defs = [
    { key: "0-1", label: "0-1 oy", min: 0, max: 1 },
    { key: "1-3", label: "1-3 oy", min: 1, max: 3 },
    { key: "3-6", label: "3-6 oy", min: 3, max: 6 },
    { key: "6-12", label: "6-12 oy", min: 6, max: 12 },
    { key: "12+", label: "1 yildan ortiq", min: 12, max: null },
  ];
  const counts = Object.fromEntries(defs.map((d) => [d.key, 0]));
  for (const m of durations) {
    const d = defs.find((b) => m >= b.min && (b.max === null || m < b.max));
    if (d) counts[d.key] += 1;
  }
  return defs.map((d) => ({ key: d.key, label: d.label, count: counts[d.key] }));
};
