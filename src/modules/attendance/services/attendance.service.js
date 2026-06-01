import mongoose from "mongoose";
import Attendance from "../../../models/attendance.model.js";
import AttendanceExemption from "../../../models/attendanceExemption.model.js";
import AttendanceSettings from "../../../models/attendanceSettings.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Invoice from "../../../models/invoice.model.js";
import Payment from "../../../models/payment.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { buildMeta } from "../../../utils/pagination.js";
import { ROLES } from "../../../constants/roles.js";
import {
  dateKeyOf,
  dayOfWeekOf,
  toUtcMidnight,
  getClassDaysInRange,
  defaultStatusFor,
} from "../../../helpers/attendance.helper.js";
import { listForTeacher } from "../../groups/services/groups.service.js";

const STUDENT_PROJECTION = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
};

const ensureGroup = async (groupId) => {
  const g = await Group.findById(groupId);
  if (!g) throw new ApiError(404, "Guruh topilmadi");
  return g;
};

// ─── settings ───
const getSettings = async () =>
  AttendanceSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

// ─── single group + date ───
export const listForGroupOnDate = async (groupId, dateInput) => {
  const group = await ensureGroup(groupId);
  const date = toUtcMidnight(dateInput);
  const dow = dayOfWeekOf(date);
  const slots = (group.schedule || [])
    .filter((s) => s.day === dow)
    .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
  const isClassDay = slots.length > 0;

  // Active memberships shu sanada (joinedAt <= date && (leftAt is null || leftAt > date))
  const memberships = await GroupMembership.find({
    group: groupId,
    joinedAt: { $lte: date },
    $or: [{ leftAt: null }, { leftAt: { $gt: date } }],
  }).populate("student", STUDENT_PROJECTION);

  const studentIds = memberships
    .filter((m) => m.student)
    .map((m) => m.student._id);

  const dKey = dateKeyOf(date);
  const [attendances, exemptions] = await Promise.all([
    Attendance.find({
      group: groupId,
      student: { $in: studentIds },
      dateKey: dKey,
    }),
    AttendanceExemption.find({
      student: { $in: studentIds },
      isActive: true,
    }),
  ]);

  const attMap = new Map();
  for (const a of attendances) attMap.set(String(a.student), a);
  const exempMap = new Map();
  for (const ex of exemptions) {
    const key = String(ex.student);
    if (!exempMap.has(key)) exempMap.set(key, []);
    exempMap.get(key).push(ex);
  }

  const rows = memberships
    .filter((m) => m.student)
    .map((m) => {
      const sid = String(m.student._id);
      const attendance = attMap.get(sid) || null;
      const studentExemptions = exempMap.get(sid) || [];
      const def = defaultStatusFor(studentExemptions, date, dow);
      return {
        student: m.student.toJSON(),
        attendance: attendance ? attendance.toJSON() : null,
        defaultStatus: def,
      };
    });

  return {
    group: {
      _id: group._id,
      name: group.name,
      schedule: group.schedule,
    },
    date,
    dateKey: dKey,
    isClassDay,
    slots,
    rows,
  };
};

// ─── bulk record ───
const validateItem = (item) => {
  if (!item.studentId) throw new ApiError(400, "O'quvchi kerak");
  if (!["present", "absent", "excused", "exempt"].includes(item.status)) {
    throw new ApiError(400, "Holat noto'g'ri");
  }
  // Sababli uchun sabab ixtiyoriy - status tanlanishi yetarli
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

export const bulkRecord = async (
  groupId,
  dateInput,
  items,
  currentUser,
  source = "teacher",
) => {
  const group = await ensureGroup(groupId);

  // TEACHER bo'lsa, group.teachers ichida bo'lishi shart
  if (currentUser.role === ROLES.TEACHER) {
    const isOwn = (group.teachers || []).some(
      (t) => String(t) === String(currentUser._id),
    );
    if (!isOwn) {
      throw new ApiError(403, "Bu guruh sizga biriktirilmagan");
    }
  }

  const date = toUtcMidnight(dateInput);
  const dKey = dateKeyOf(date);

  // Kelajak sana uchun davomat belgilanmaydi (o'tmishni tuzatish mumkin)
  if (date.getTime() > toUtcMidnight(new Date()).getTime()) {
    throw new ApiError(400, "Kelajak kun uchun davomat belgilab bo'lmaydi");
  }

  // Faqat guruhning dars kunlari belgilanadi (dars vaqti o'tgan/oldin — farqi yo'q)
  const isClassDay = (group.schedule || []).some(
    (s) => s.day === dayOfWeekOf(date),
  );
  if (!isClassDay) {
    throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Hech bo'lmaganda bitta yozuv kerak");
  }
  for (const item of items) validateItem(item);

  const results = await runWithSession(async (session) => {
    const opts = session ? { session } : {};
    const docs = [];
    for (const item of items) {
      const update = {
        $set: {
          status: item.status,
          reason: item.reason || "",
          lateMinutes: item.lateMinutes || 0,
          recordedBy: currentUser._id,
          recordedAt: new Date(),
          source,
        },
        $setOnInsert: {
          group: groupId,
          student: item.studentId,
          date,
          dateKey: dKey,
        },
      };
      const doc = await Attendance.findOneAndUpdate(
        { group: groupId, student: item.studentId, dateKey: dKey },
        update,
        { upsert: true, new: true, setDefaultsOnInsert: true, ...opts },
      );
      docs.push(doc);
    }
    return docs;
  });

  // Davomat o'zgardi → correlation cache'ni shu oy uchun bekor qilamiz
  correlationCacheInvalidate(date.getUTCFullYear(), date.getUTCMonth() + 1);
  return results;
};

// ─── monthly + summary ───
const startOfMonth = (year, month) =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
const endOfMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

// O'quvchining [rangeStart, rangeEnd] oralig'idagi class-day xaritasi (har guruh × sana → status)
const buildStudentClassDays = async (studentId, rangeStart, rangeEnd) => {
  // Shu oraliqda active bo'lgan memberships
  const memberships = await GroupMembership.find({
    student: studentId,
    joinedAt: { $lte: rangeEnd },
    $or: [{ leftAt: null }, { leftAt: { $gte: rangeStart } }],
  }).populate("group");

  const exemptions = await AttendanceExemption.find({
    student: studentId,
    isActive: true,
  });

  const groups = [];
  const dKeys = new Set();

  for (const m of memberships) {
    if (!m.group) continue;
    // Shu membershipning effective range'i oraliq ichida
    const effFrom =
      m.joinedAt > rangeStart ? toUtcMidnight(m.joinedAt) : rangeStart;
    const effTo =
      m.leftAt && m.leftAt < rangeEnd ? toUtcMidnight(m.leftAt) : rangeEnd;

    const classDays = getClassDaysInRange(m.group, effFrom, effTo);
    const days = classDays.map((cd) => {
      const def = defaultStatusFor(exemptions, cd.date, cd.dayOfWeek);
      dKeys.add(cd.dateKey);
      return {
        date: cd.date,
        dateKey: cd.dateKey,
        dayOfWeek: cd.dayOfWeek,
        defaultStatus: def,
        attendance: null, // keyinroq to'ldiriladi
      };
    });

    groups.push({
      group: { _id: m.group._id, name: m.group.name, schedule: m.group.schedule },
      days,
    });
  }

  // Mavjud Attendance yozuvlarini bir martada olamiz
  const attendances = await Attendance.find({
    student: studentId,
    dateKey: { $in: Array.from(dKeys) },
  });
  const attMap = new Map();
  for (const a of attendances) attMap.set(`${String(a.group)}|${a.dateKey}`, a);

  for (const g of groups) {
    for (const d of g.days) {
      d.attendance =
        attMap.get(`${String(g.group._id)}|${d.dateKey}`)?.toJSON() || null;
    }
  }

  return groups;
};

// O'quvchining bir oy ichidagi class-day xaritasi (har guruh × sana → status)
export const getStudentMonthly = async (studentId, { year, month }) => {
  const groups = await buildStudentClassDays(
    studentId,
    startOfMonth(year, month),
    endOfMonth(year, month),
  );
  return { studentId, year, month, groups };
};

// O'quvchining butun yil bo'yicha class-day xaritasi (yillik heatmap uchun)
export const getStudentYear = async (studentId, { year }) => {
  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const groups = await buildStudentClassDays(studentId, yearStart, yearEnd);
  return { studentId, year, groups };
};

// ─── guruh bo'yicha oylik matritsa (o'quvchi × sana) ───
export const getGroupMonthly = async (groupId, { year, month }) => {
  const group = await ensureGroup(groupId);
  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);

  const scheduleDays = new Set((group.schedule || []).map((s) => s.day));

  const dates = [];
  const dateKeys = [];
  const cur = new Date(monthStart);
  while (cur.getTime() <= monthEnd.getTime()) {
    const dow = dayOfWeekOf(cur);
    const dKey = dateKeyOf(cur);
    dates.push({
      date: new Date(cur),
      dateKey: dKey,
      dayOfWeek: dow,
      isClassDay: scheduleDays.has(dow),
    });
    dateKeys.push(dKey);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const memberships = await GroupMembership.find({
    group: groupId,
    joinedAt: { $lte: monthEnd },
    $or: [{ leftAt: null }, { leftAt: { $gte: monthStart } }],
  }).populate("student", STUDENT_PROJECTION);

  const activeMemberships = memberships.filter((m) => m.student);
  const studentIds = activeMemberships.map((m) => m.student._id);

  const [attendances, exemptions] = await Promise.all([
    Attendance.find({
      group: groupId,
      student: { $in: studentIds },
      dateKey: { $in: dateKeys },
    }),
    AttendanceExemption.find({
      student: { $in: studentIds },
      isActive: true,
    }),
  ]);

  const attMap = new Map();
  for (const a of attendances) {
    attMap.set(`${String(a.student)}|${a.dateKey}`, a);
  }
  const exempMap = new Map();
  for (const ex of exemptions) {
    const key = String(ex.student);
    if (!exempMap.has(key)) exempMap.set(key, []);
    exempMap.get(key).push(ex);
  }

  const students = activeMemberships.map((m) => {
    const sid = String(m.student._id);
    const stuExemptions = exempMap.get(sid) || [];
    const joinedTs = toUtcMidnight(m.joinedAt).getTime();
    const leftTs = m.leftAt ? toUtcMidnight(m.leftAt).getTime() : null;

    const cells = {};
    for (const d of dates) {
      const ts = d.date.getTime();
      if (!d.isClassDay) {
        cells[d.dateKey] = null;
        continue;
      }
      if (ts < joinedTs || (leftTs !== null && ts > leftTs)) {
        cells[d.dateKey] = null;
        continue;
      }
      const att = attMap.get(`${sid}|${d.dateKey}`);
      const def = defaultStatusFor(stuExemptions, d.date, d.dayOfWeek);
      cells[d.dateKey] = att
        ? {
            status: att.status,
            defaultStatus: def,
            reason: att.reason || "",
            lateMinutes: att.lateMinutes || 0,
          }
        : { status: null, defaultStatus: def, reason: "", lateMinutes: 0 };
    }

    return {
      student: m.student.toJSON(),
      cells,
    };
  });

  students.sort((a, b) => {
    const lnA = (a.student.lastName || "").toLowerCase();
    const lnB = (b.student.lastName || "").toLowerCase();
    if (lnA !== lnB) return lnA < lnB ? -1 : 1;
    const fnA = (a.student.firstName || "").toLowerCase();
    const fnB = (b.student.firstName || "").toLowerCase();
    if (fnA === fnB) return 0;
    return fnA < fnB ? -1 : 1;
  });

  return {
    group: { _id: group._id, name: group.name, schedule: group.schedule },
    year,
    month,
    dates,
    students,
  };
};

// ─── summary (o'quvchi bo'yicha) ───
const buildSummaryFromBuckets = (counts) => {
  const total =
    counts.present + counts.absent + counts.excused + counts.late + counts.exempt;
  const denom = total - counts.exempt;
  const numer = counts.present + counts.late;
  const rate = denom > 0 ? Math.round((numer / denom) * 100) : null;
  return {
    totalClasses: total,
    present: counts.present,
    absent: counts.absent,
    excused: counts.excused,
    late: counts.late,
    exempt: counts.exempt,
    attendanceRate: rate,
  };
};

// Pure: membership + exemption ro'yxatidan [from,to] oralig'idagi class-day cell'lar
const computeClassDays = ({ memberships, exemptions, from, to }) => {
  let total = 0;
  let exemptDefault = 0;
  const cells = [];

  for (const m of memberships) {
    if (!m.group) continue;
    const effFrom = m.joinedAt > from ? m.joinedAt : from;
    const effTo = m.leftAt && m.leftAt < to ? m.leftAt : to;
    const classDays = getClassDaysInRange(m.group, effFrom, effTo);
    for (const cd of classDays) {
      total += 1;
      const def = defaultStatusFor(exemptions, cd.date, cd.dayOfWeek);
      if (def === "exempt") exemptDefault += 1;
      cells.push({ groupId: m.group._id, dateKey: cd.dateKey });
    }
  }
  return { total, exemptDefault, cells };
};

// Pure: class-day cell'lar + attendance yozuvlaridan summary. attendances cell'lardan
// keng bo'lishi mumkin — faqat mos group|dateKey lar hisobga olinadi.
const summarizeCells = ({ total, exemptDefault, cells, attendances }) => {
  if (total === 0) {
    return buildSummaryFromBuckets({
      present: 0,
      absent: 0,
      excused: 0,
      late: 0,
      exempt: 0,
    });
  }

  const attMap = new Map();
  for (const a of attendances) attMap.set(`${String(a.group)}|${a.dateKey}`, a);

  const counts = { present: 0, absent: 0, excused: 0, late: 0, exempt: 0 };
  for (const c of cells) {
    const a = attMap.get(`${String(c.groupId)}|${c.dateKey}`);
    if (a) {
      counts[a.status] = (counts[a.status] || 0) + 1;
    }
    // belgilanmagan = null (hech qaysi bucket'ga qo'shilmaydi, totalClasses ichida lekin)
  }
  // Belgilanmagan exempt-default'larni avto exempt deb hisoblash
  const markedTotal =
    counts.present + counts.absent + counts.excused + counts.late + counts.exempt;
  const unmarked = total - markedTotal;
  const exemptUnmarked = Math.min(unmarked, exemptDefault);
  counts.exempt += exemptUnmarked;
  const summary = buildSummaryFromBuckets(counts);
  summary.totalClasses = total; // total class days (belgilanganmi yoki yo'q)
  summary.unmarked = total - markedTotal - exemptUnmarked;
  return summary;
};

export const getStudentSummary = async (
  studentId,
  { fromDate, toDate } = {},
) => {
  if (!fromDate || !toDate) {
    return summarizeCells({ total: 0, exemptDefault: 0, cells: [], attendances: [] });
  }
  const from = toUtcMidnight(fromDate);
  const to = toUtcMidnight(toDate);

  const [memberships, exemptions] = await Promise.all([
    GroupMembership.find({
      student: studentId,
      joinedAt: { $lte: to },
      $or: [{ leftAt: null }, { leftAt: { $gte: from } }],
    }).populate("group"),
    AttendanceExemption.find({ student: studentId, isActive: true }),
  ]);

  const { total, exemptDefault, cells } = computeClassDays({
    memberships,
    exemptions,
    from,
    to,
  });

  if (total === 0) {
    return summarizeCells({ total: 0, exemptDefault: 0, cells: [], attendances: [] });
  }

  const dKeys = Array.from(new Set(cells.map((c) => c.dateKey)));
  const attendances = await Attendance.find({
    student: studentId,
    dateKey: { $in: dKeys },
  });

  return summarizeCells({ total, exemptDefault, cells, attendances });
};

// ─── group summary ───
export const getGroupSummary = async (groupId, { fromDate, toDate }) => {
  const group = await ensureGroup(groupId);
  const from = toUtcMidnight(fromDate);
  const to = toUtcMidnight(toDate);

  // Diapazonda active bo'lgan barcha memberships
  const memberships = await GroupMembership.find({
    group: groupId,
    joinedAt: { $lte: to },
    $or: [{ leftAt: null }, { leftAt: { $gte: from } }],
  }).populate("student", STUDENT_PROJECTION);

  const perStudent = [];
  let aggregate = {
    present: 0,
    absent: 0,
    excused: 0,
    late: 0,
    exempt: 0,
    totalClasses: 0,
  };

  for (const m of memberships) {
    if (!m.student) continue;
    const summary = await getStudentSummary(m.student._id, {
      fromDate: from,
      toDate: to,
    });
    perStudent.push({
      student: m.student.toJSON(),
      summary,
    });
    aggregate.present += summary.present;
    aggregate.absent += summary.absent;
    aggregate.excused += summary.excused;
    aggregate.late += summary.late;
    aggregate.exempt += summary.exempt;
    aggregate.totalClasses += summary.totalClasses;
  }

  const denom = aggregate.totalClasses - aggregate.exempt;
  const numer = aggregate.present + aggregate.late;
  const groupRate = denom > 0 ? Math.round((numer / denom) * 100) : null;

  return {
    group: { _id: group._id, name: group.name },
    range: { fromDate: from, toDate: to },
    aggregate: { ...aggregate, groupRate },
    perStudent,
  };
};

// ─── teacher summary ───
export const getTeacherGroupsSummary = async (teacherId, { fromDate, toDate }) => {
  const groups = await listForTeacher(teacherId);
  const result = [];
  for (const g of groups) {
    const summary = await getGroupSummary(g._id, { fromDate, toDate });
    result.push({
      group: { _id: g._id, name: g.name, schedule: g.schedule },
      groupRate: summary.aggregate.groupRate,
      aggregate: summary.aggregate,
    });
  }
  return result;
};

// ─── dashboard ───
// Barcha hisob-kitob 5 ta so'rovda bajariladi (oldingi N+1 kaskad o'rniga):
// guruhlar, guruh membershiplari, o'quvchilarning barcha membershiplari, exemptions, attendances.
export const getDashboardStats = async ({ fromDate, toDate, page = 1, limit = 20 }) => {
  const settings = await getSettings();
  const from = toUtcMidnight(fromDate);
  const to = toUtcMidnight(toDate);

  const groups = await Group.find({ isActive: true });
  const groupIds = groups.map((g) => g._id);

  // Oraliqda active bo'lgan guruh membershiplari (groupBreakdown + o'quvchilar ro'yxati uchun)
  const groupMemberships = await GroupMembership.find({
    group: { $in: groupIds },
    joinedAt: { $lte: to },
    $or: [{ leftAt: null }, { leftAt: { $gte: from } }],
  }).populate("student", STUDENT_PROJECTION);

  const studentIdSet = new Set();
  for (const m of groupMemberships) {
    if (m.student) studentIdSet.add(String(m.student._id));
  }
  const studentIds = Array.from(studentIdSet).map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  // Shu o'quvchilarning BARCHA membershiplari + exemptions + attendances — 3 so'rov, N+1 yo'q.
  // (per-student summary cross-group hisoblanadi — getStudentSummary bilan bir xil)
  const [allMemberships, exemptions, attendances] = await Promise.all([
    GroupMembership.find({
      student: { $in: studentIds },
      joinedAt: { $lte: to },
      $or: [{ leftAt: null }, { leftAt: { $gte: from } }],
    }).populate("group"),
    AttendanceExemption.find({ student: { $in: studentIds }, isActive: true }),
    Attendance.find({ student: { $in: studentIds }, date: { $gte: from, $lte: to } }),
  ]);

  const groupBy = (docs, keyOf) => {
    const map = new Map();
    for (const d of docs) {
      const k = keyOf(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    }
    return map;
  };
  const membershipsByStudent = groupBy(allMemberships, (m) => String(m.student));
  const exemptionsByStudent = groupBy(exemptions, (ex) => String(ex.student));
  const attendancesByStudent = groupBy(attendances, (a) => String(a.student));

  // Har o'quvchi uchun cross-group summary — bir martda (getStudentSummary bilan bir xil natija)
  const summaryByStudent = new Map();
  for (const sid of studentIdSet) {
    const { total, exemptDefault, cells } = computeClassDays({
      memberships: membershipsByStudent.get(sid) || [],
      exemptions: exemptionsByStudent.get(sid) || [],
      from,
      to,
    });
    summaryByStudent.set(
      sid,
      summarizeCells({
        total,
        exemptDefault,
        cells,
        attendances: attendancesByStudent.get(sid) || [],
      }),
    );
  }

  const membershipsByGroup = groupBy(
    groupMemberships.filter((m) => m.student),
    (m) => String(m.group),
  );

  let aggregate = {
    present: 0,
    absent: 0,
    excused: 0,
    late: 0,
    exempt: 0,
    totalClasses: 0,
  };
  const groupBreakdownAll = [];
  const studentRates = new Map();

  for (const g of groups) {
    const members = membershipsByGroup.get(String(g._id)) || [];
    const gAgg = { present: 0, absent: 0, excused: 0, late: 0, exempt: 0, totalClasses: 0 };

    for (const m of members) {
      const sid = String(m.student._id);
      const s = summaryByStudent.get(sid);
      if (!s) continue;
      gAgg.present += s.present;
      gAgg.absent += s.absent;
      gAgg.excused += s.excused;
      gAgg.late += s.late;
      gAgg.exempt += s.exempt;
      gAgg.totalClasses += s.totalClasses;

      const cur = studentRates.get(sid) || {
        student: m.student.toJSON(),
        present: 0,
        absent: 0,
        late: 0,
        exempt: 0,
        excused: 0,
        totalClasses: 0,
      };
      cur.present += s.present;
      cur.absent += s.absent;
      cur.late += s.late;
      cur.exempt += s.exempt;
      cur.excused += s.excused;
      cur.totalClasses += s.totalClasses;
      studentRates.set(sid, cur);
    }

    const gDenom = gAgg.totalClasses - gAgg.exempt;
    const gNumer = gAgg.present + gAgg.late;
    const groupRate = gDenom > 0 ? Math.round((gNumer / gDenom) * 100) : null;

    aggregate.present += gAgg.present;
    aggregate.absent += gAgg.absent;
    aggregate.excused += gAgg.excused;
    aggregate.late += gAgg.late;
    aggregate.exempt += gAgg.exempt;
    aggregate.totalClasses += gAgg.totalClasses;

    groupBreakdownAll.push({
      groupId: g._id,
      name: g.name,
      groupRate,
      totalClasses: gAgg.totalClasses,
    });
  }

  const overallDenom = aggregate.totalClasses - aggregate.exempt;
  const overallNumer = aggregate.present + aggregate.late;
  const overallRate =
    overallDenom > 0 ? Math.round((overallNumer / overallDenom) * 100) : null;

  // Per-student rates
  const studentList = Array.from(studentRates.values()).map((s) => {
    const denom = s.totalClasses - s.exempt;
    const numer = s.present + s.late;
    const rate = denom > 0 ? Math.round((numer / denom) * 100) : null;
    return { ...s, rate };
  });

  const lowAttendanceStudents = studentList
    .filter((s) => s.rate !== null && s.rate < settings.lowAttendanceThreshold)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 20);

  const topAbsent = [...studentList]
    .sort((a, b) => b.absent - a.absent)
    .filter((s) => s.absent > 0)
    .slice(0, 10);

  // groupBreakdown'ni nom bo'yicha tartiblab paginate qilamiz (umumiy stat'lar to'liq qoladi)
  groupBreakdownAll.sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", "uz"),
  );
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * safeLimit;
  const groupBreakdown = groupBreakdownAll.slice(start, start + safeLimit);

  return {
    overallRate,
    aggregate,
    threshold: settings.lowAttendanceThreshold,
    studentsCount: studentList.length,
    lowAttendanceStudents,
    topAbsent,
    groupBreakdown,
    groupBreakdownMeta: buildMeta({
      page: safePage,
      limit: safeLimit,
      total: groupBreakdownAll.length,
    }),
  };
};

// ─── correlation ───
// In-memory cache (year-month -> { data, expires }). TTL: 5 minutes.
// Davomat yoki invoice o'zgarsa, correlationCacheInvalidate() chaqirilishi kerak.
const correlationCache = new Map();
const CORRELATION_TTL_MS = 5 * 60 * 1000;
const CORRELATION_BATCH = 25;

export const correlationCacheInvalidate = (year, month) => {
  if (year && month) {
    correlationCache.delete(`${year}-${month}`);
  } else {
    correlationCache.clear();
  }
};

export const correlationReport = async ({ year, month }) => {
  const cacheKey = `${year}-${month}`;
  const cached = correlationCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);

  // Shu oy uchun barcha non-cancelled invoices — minimal proyeksiya
  const invoices = await Invoice.find(
    {
      "period.year": Number(year),
      "period.month": Number(month),
      status: { $ne: "cancelled" },
    },
    "student group totalDue paidAmount status",
  )
    .populate("student", STUDENT_PROJECTION)
    .populate("group", { name: 1 })
    .lean();

  // Studentlarning summary'larini batch'larda parallel hisoblash.
  // Avval invoices'ni filtrlab, bekor nullable'larni olib tashlash.
  const valid = invoices.filter((inv) => inv.student && inv.group);

  // Bir studentning bir oy ichidagi summary'si bir xil — duplikatlarni dedupe qilamiz
  const uniqueStudentIds = Array.from(
    new Set(valid.map((inv) => String(inv.student._id))),
  );
  const summaryByStudent = new Map();
  for (let i = 0; i < uniqueStudentIds.length; i += CORRELATION_BATCH) {
    const batch = uniqueStudentIds.slice(i, i + CORRELATION_BATCH);
    const summaries = await Promise.all(
      batch.map((sid) =>
        getStudentSummary(sid, { fromDate: monthStart, toDate: monthEnd }),
      ),
    );
    batch.forEach((sid, idx) => summaryByStudent.set(sid, summaries[idx]));
  }

  const result = valid.map((inv) => {
    const summary = summaryByStudent.get(String(inv.student._id)) || {
      attendanceRate: null,
      totalClasses: 0,
      present: 0,
      late: 0,
    };
    return {
      studentId: inv.student._id,
      firstName: inv.student.firstName,
      lastName: inv.student.lastName,
      groupId: inv.group._id,
      groupName: inv.group.name,
      attendanceRate: summary.attendanceRate,
      totalClasses: summary.totalClasses,
      attended: summary.present + summary.late,
      invoiced: inv.totalDue,
      paid: inv.paidAmount,
      debt: Math.max(0, inv.totalDue - inv.paidAmount),
      status: inv.status,
    };
  });

  correlationCache.set(cacheKey, {
    data: result,
    expires: Date.now() + CORRELATION_TTL_MS,
  });
  return result;
};

// ─── consecutive absences ───
export const consecutiveAbsences = async (studentId) => {
  const recent = await Attendance.find({ student: studentId })
    .sort({ date: -1 })
    .limit(50);
  let count = 0;
  for (const a of recent) {
    if (a.status === "absent") count += 1;
    else break;
  }
  return count;
};
