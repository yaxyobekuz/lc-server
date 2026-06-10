import mongoose from "mongoose";
import Grade from "../../../models/grade.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import ApiError from "../../../utils/ApiError.js";
import {
  parseLocalDay,
  dateKeyOf,
  dayOfWeekOf,
  scheduleActiveOn,
} from "../../../helpers/attendance.helper.js";

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

// Kunning sessiyalari (davomat bilan bir xil ta'rif): bir slotli kun → ""; ko'p
// slotli kun → slot=startTime.
const sessionsForDay = (group, dow, date = null) => {
  // Shu sanada AMAL QILGAN jadval versiyasi (versiyalash) - davomat bilan bir xil
  const daySlots = scheduleActiveOn(group.schedule, date)
    .filter((s) => s.day === dow)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
  const multi = daySlots.length > 1;
  return daySlots.map((s) => ({
    slot: multi ? s.startTime : "",
    startTime: s.startTime,
    endTime: s.endTime,
  }));
};

// Berilgan sanada guruhning aktiv a'zolari (davomat roster filtri bilan bir xil).
const activeMembersOn = async (groupId, date) => {
  const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return GroupMembership.find({
    group: groupId,
    joinedAt: { $lt: dayEnd },
    $or: [{ leftAt: null }, { leftAt: { $gt: date } }],
    isDeleted: { $ne: true },
  }).populate("student", STUDENT_PROJECTION);
};

// ─── Guruh + sana uchun baholash ro'yxati (mavjud ballar bilan) ───
export const listForGroupOnDate = async (groupId, dateInput, slotInput = null) => {
  const group = await ensureGroup(groupId);
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dow = dayOfWeekOf(date);
  const sessions = sessionsForDay(group, dow, date);
  const selectedSlot =
    slotInput !== null && slotInput !== undefined
      ? slotInput
      : sessions[0]?.slot ?? "";

  const memberships = await activeMembersOn(groupId, date);
  const studentIds = memberships.filter((m) => m.student).map((m) => m.student._id);

  const dKey = dateKeyOf(date);
  const grades = await Grade.find({
    group: groupId,
    student: { $in: studentIds },
    dateKey: dKey,
    slot: selectedSlot,
    isDeleted: { $ne: true },
  });
  const gradeMap = new Map();
  for (const g of grades) gradeMap.set(String(g.student), g);

  const rows = memberships
    .filter((m) => m.student)
    .map((m) => {
      const g = gradeMap.get(String(m.student._id)) || null;
      return {
        student: m.student.toJSON(),
        grade: g ? g.toJSON() : null,
      };
    });

  return {
    group: { _id: group._id, name: group.name, schedule: group.schedule },
    date,
    dateKey: dKey,
    sessions,
    slot: selectedSlot,
    isClassDay: sessions.length > 0,
    rows,
  };
};

const validateItem = (item) => {
  if (!item.studentId) throw new ApiError(400, "O'quvchi kerak");
  const v = Number(item.value);
  if (!Number.isInteger(v) || v < 1 || v > 5) {
    throw new ApiError(400, "Ball 1 dan 5 gacha bo'lishi kerak");
  }
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
    // Standalone Mongo (transaction yo'q) - sessiyasiz qayta urinamiz
    if (err?.code === 20 || err?.codeName === "IllegalOperation") {
      return fn(null);
    }
    throw err;
  }
};

// ─── Guruh + sana uchun ballarni bulk saqlash (upsert + audit) ───
export const bulkRecord = async (
  groupId,
  dateInput,
  items,
  currentUser,
  slot = null,
) => {
  const group = await ensureGroup(groupId);
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dKey = dateKeyOf(date);
  const dow = dayOfWeekOf(date);
  const sessions = sessionsForDay(group, dow, date);
  if (sessions.length === 0) {
    throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
  }
  const normalizedSlot =
    sessions.length > 1
      ? slot || sessions[0].slot
      : "";
  if (
    sessions.length > 1 &&
    !sessions.some((s) => s.slot === normalizedSlot)
  ) {
    throw new ApiError(400, "Sessiya (dars vaqti) noto'g'ri");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Hech bo'lmaganda bitta ball kerak");
  }
  for (const item of items) validateItem(item);

  // Har bir o'quvchi shu sanada guruhning aktiv a'zosi ekanini tekshiramiz
  const studentIds = items.map((it) => it.studentId);
  const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const activeMembers = await GroupMembership.find({
    group: groupId,
    student: { $in: studentIds },
    joinedAt: { $lt: dayEnd },
    $or: [{ leftAt: null }, { leftAt: { $gt: date } }],
    isDeleted: { $ne: true },
  }).select("student");
  const memberSet = new Set(activeMembers.map((m) => String(m.student)));
  for (const item of items) {
    if (!memberSet.has(String(item.studentId))) {
      throw new ApiError(400, "O'quvchi bu sanada guruhning aktiv a'zosi emas");
    }
  }

  // Audit uchun mavjud ballarni oldindan olamiz
  const existing = await Grade.find({
    group: groupId,
    student: { $in: studentIds },
    dateKey: dKey,
    slot: normalizedSlot,
    isDeleted: { $ne: true },
  });
  const existingMap = new Map();
  for (const g of existing) existingMap.set(String(g.student), g);

  const docs = await runWithSession(async (session) => {
    const opts = session ? { session } : {};
    const out = [];
    for (const item of items) {
      const prev = existingMap.get(String(item.studentId));
      const value = Number(item.value);
      const changed = !prev || prev.value !== value;
      const update = {
        $set: {
          value,
          comment: item.comment || "",
          recordedBy: currentUser._id,
          recordedAt: new Date(),
          source: "teacher",
          isDeleted: false,
        },
        $setOnInsert: {
          group: groupId,
          student: item.studentId,
          date,
          dateKey: dKey,
          slot: normalizedSlot,
        },
      };
      if (changed) {
        update.$push = {
          history: {
            at: new Date(),
            by: currentUser._id,
            from: prev ? prev.value : null,
            to: value,
            source: "teacher",
          },
        };
      }
      const filter = {
        group: groupId,
        student: item.studentId,
        dateKey: dKey,
        slot: normalizedSlot,
      };
      let doc;
      try {
        doc = await Grade.findOneAndUpdate(filter, update, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          ...opts,
        });
      } catch (err) {
        if (err?.code === 11000) {
          delete update.$setOnInsert;
          doc = await Grade.findOneAndUpdate(filter, update, {
            new: true,
            ...opts,
          });
        } else {
          throw err;
        }
      }
      out.push(doc);
    }
    return out;
  });

  return { count: docs.length, slot: normalizedSlot };
};

// ─── Guruh summary: o'rtacha ball + tarqalish (1..5) ───
export const getGroupSummary = async (groupId, { fromDate, toDate }) => {
  await ensureGroup(groupId);
  const from = parseLocalDay(fromDate);
  const to = parseLocalDay(toDate);
  if (!from || !to) throw new ApiError(400, "Sana noto'g'ri");
  const fromKey = dateKeyOf(from);
  const toKey = dateKeyOf(to);

  const grades = await Grade.find({
    group: groupId,
    dateKey: { $gte: fromKey, $lte: toKey },
    isDeleted: { $ne: true },
  })
    .populate("student", STUDENT_PROJECTION)
    .lean();

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byStudent = new Map();
  let sum = 0;
  for (const g of grades) {
    dist[g.value] = (dist[g.value] || 0) + 1;
    sum += g.value;
    if (!g.student) continue;
    const sid = String(g.student._id);
    if (!byStudent.has(sid)) {
      byStudent.set(sid, { student: g.student, sum: 0, count: 0 });
    }
    const e = byStudent.get(sid);
    e.sum += g.value;
    e.count += 1;
  }

  const perStudent = Array.from(byStudent.values())
    .map((e) => ({
      student: e.student,
      average: e.count ? Math.round((e.sum / e.count) * 100) / 100 : null,
      count: e.count,
    }))
    .sort((a, b) => (b.average || 0) - (a.average || 0));

  const average = grades.length
    ? Math.round((sum / grades.length) * 100) / 100
    : null;

  return {
    average,
    total: grades.length,
    distribution: dist,
    perStudent,
  };
};

// ─── O'quvchi summary: o'rtacha ball + oxirgi ballar ───
export const getStudentSummary = async (
  studentId,
  { fromDate, toDate, scopeGroupIds } = {},
) => {
  const filter = { student: studentId, isDeleted: { $ne: true } };
  if (fromDate && toDate) {
    filter.dateKey = { $gte: dateKeyOf(parseLocalDay(fromDate)), $lte: dateKeyOf(parseLocalDay(toDate)) };
  }
  if (Array.isArray(scopeGroupIds)) {
    filter.group = { $in: scopeGroupIds };
  }
  const grades = await Grade.find(filter)
    .populate("group", { name: 1 })
    .sort({ dateKey: -1 })
    .lean();

  const count = grades.length;
  const sum = grades.reduce((acc, g) => acc + g.value, 0);
  const average = count ? Math.round((sum / count) * 100) / 100 : null;

  return {
    average,
    count,
    recent: grades.slice(0, 20).map((g) => ({
      _id: g._id,
      value: g.value,
      dateKey: g.dateKey,
      comment: g.comment || "",
      group: g.group ? { _id: g.group._id, name: g.group.name } : null,
    })),
  };
};

// ─── Reyting uchun: bir nechta o'quvchining o'rtacha balli (xaritada) ───
export const averagesForStudents = async (studentIds, { fromDate, toDate, groupId } = {}) => {
  const match = {
    student: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
    isDeleted: { $ne: true },
  };
  if (groupId) match.group = new mongoose.Types.ObjectId(String(groupId));
  if (fromDate && toDate) {
    match.dateKey = { $gte: dateKeyOf(parseLocalDay(fromDate)), $lte: dateKeyOf(parseLocalDay(toDate)) };
  }
  const rows = await Grade.aggregate([
    { $match: match },
    { $group: { _id: "$student", sum: { $sum: "$value" }, count: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), {
      average: r.count ? Math.round((r.sum / r.count) * 100) / 100 : null,
      count: r.count,
    });
  }
  return map;
};
