import mongoose from "mongoose";
import RatingSettings from "../../../models/ratingSettings.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { averagesForStudents } from "./grades.service.js";
import { getStudentSummary as getAttendanceStudentSummary } from "../../attendance/services/attendance.service.js";

const STUDENT_PROJECTION = {
  firstName: 1,
  lastName: 1,
  username: 1,
};

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (days) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

// ─── Sozlamalar (yagona hujjat) ───
export const getSettings = async () =>
  RatingSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

export const updateSettings = async (body) => {
  const doc = await getSettings();
  if (body.gradeWeight !== undefined) {
    const v = Number(body.gradeWeight);
    if (Number.isNaN(v) || v < 0 || v > 1) {
      throw new ApiError(400, "Ball vazni 0 dan 1 gacha bo'lishi kerak");
    }
    doc.gradeWeight = v;
  }
  if (body.attendanceWeight !== undefined) {
    const v = Number(body.attendanceWeight);
    if (Number.isNaN(v) || v < 0 || v > 1) {
      throw new ApiError(400, "Davomat vazni 0 dan 1 gacha bo'lishi kerak");
    }
    doc.attendanceWeight = v;
  }
  await doc.save();
  return doc;
};

// point = (avgGrade/5*100)*gradeWeight + (attendanceRate)*attendanceWeight
const computePoint = (avgGrade, attendanceRate, settings) => {
  const gradePart = avgGrade != null ? (avgGrade / 5) * 100 : 0;
  const attPart = attendanceRate != null ? attendanceRate : 0;
  const raw =
    gradePart * settings.gradeWeight + attPart * settings.attendanceWeight;
  return Math.round(raw * 100) / 100;
};

// ─── Leaderboard ───
// scope: "all" (barcha aktiv o'quvchilar) yoki groupId (shu guruh a'zolari).
// fromDate/toDate ixtiyoriy - berilmasa "umrbod" (hamma vaqt).
export const getLeaderboard = async ({
  scope = "all",
  fromDate,
  toDate,
  limit = 100,
} = {}) => {
  const settings = await getSettings();

  // O'quvchilar to'plamini aniqlaymiz (aktiv a'zoliklar bo'yicha)
  const membershipFilter = { leftAt: null, isDeleted: { $ne: true } };
  let groupId = null;
  if (scope && scope !== "all") {
    groupId = new mongoose.Types.ObjectId(String(scope));
    membershipFilter.group = groupId;
  }
  const memberships = await GroupMembership.find(membershipFilter)
    .populate("student", STUDENT_PROJECTION)
    .lean();

  // O'quvchi -> guruhlar (ko'rsatish uchun) va noyob o'quvchilar
  const studentMap = new Map();
  for (const m of memberships) {
    if (!m.student) continue;
    const sid = String(m.student._id);
    if (!studentMap.has(sid)) {
      studentMap.set(sid, { student: m.student, groupIds: [] });
    }
    studentMap.get(sid).groupIds.push(m.group);
  }
  const studentIds = Array.from(studentMap.keys());
  if (studentIds.length === 0) return { settings, items: [] };

  // Ballar o'rtachasi (bitta aggregate so'rov)
  const gradeAvgMap = await averagesForStudents(studentIds, {
    fromDate,
    toDate,
    groupId,
  });

  // Davomat foizi - har o'quvchi uchun (mavjud attendance summary).
  // Sana berilmasa "umrbod" oraliq (2 yil orqaga … bugun) - attendance summary
  // fromDate/toDate talab qiladi.
  const effFrom = fromDate || isoDaysAgo(730);
  const effTo = toDate || isoToday();
  const scopeGroupIds = groupId ? [groupId] : undefined;
  const rateEntries = await Promise.all(
    studentIds.map(async (sid) => {
      try {
        const s = await getAttendanceStudentSummary(sid, {
          fromDate: effFrom,
          toDate: effTo,
          scopeGroupIds,
        });
        return [sid, s?.attendanceRate ?? null];
      } catch {
        return [sid, null];
      }
    }),
  );
  const rateMap = new Map(rateEntries);

  const items = studentIds
    .map((sid) => {
      const { student } = studentMap.get(sid);
      const g = gradeAvgMap.get(sid) || { average: null, count: 0 };
      const attendanceRate = rateMap.get(sid);
      const point = computePoint(g.average, attendanceRate, settings);
      return {
        student: {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          username: student.username,
        },
        averageGrade: g.average,
        gradeCount: g.count,
        attendanceRate: attendanceRate,
        point,
      };
    })
    .sort((a, b) => b.point - a.point);

  // Reyting o'rinlarini (rank) belgilaymiz
  items.forEach((it, i) => {
    it.rank = i + 1;
  });

  return { settings, items: items.slice(0, limit) };
};

// O'quvchining umumiy va guruh ichidagi reytingdagi o'rni (student panel uchun).
export const getStudentRank = async (studentId, { fromDate, toDate } = {}) => {
  const all = await getLeaderboard({ scope: "all", fromDate, toDate, limit: 100000 });
  const mine = all.items.find((x) => String(x.student._id) === String(studentId));

  // O'quvchining aktiv guruhi (birinchi) ichidagi reyting
  const membership = await GroupMembership.findOne({
    student: studentId,
    leftAt: null,
    isDeleted: { $ne: true },
  }).lean();

  let group = null;
  if (membership) {
    const g = await getLeaderboard({
      scope: String(membership.group),
      fromDate,
      toDate,
      limit: 100000,
    });
    const groupDoc = await Group.findById(membership.group).select("name").lean();
    group = {
      group: groupDoc ? { _id: groupDoc._id, name: groupDoc.name } : null,
      total: g.items.length,
      me: g.items.find((x) => String(x.student._id) === String(studentId)) || null,
    };
  }

  return {
    overall: {
      total: all.items.length,
      me: mine || null,
    },
    group,
  };
};
