import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import { ROLES } from "../constants/roles.js";
import {
  dateKeyOf,
  getClassDaysInRange,
} from "../helpers/attendance.helper.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import Attendance from "../models/attendance.model.js";
import TeacherAttendance from "../models/teacherAttendance.model.js";
import Holiday from "../models/holiday.model.js";
import ActivityLog from "../models/activityLog.model.js";
import AttendanceSettings from "../models/attendanceSettings.model.js";

// fakeData + fakeExtras dan keyin ishlaydi. Avval QAMRALMAGAN kolleksiyalarni
// to'ldiradi: Holiday, TeacherAttendance, refund-to'lovlar, Attendance.history,
// arxivlangan o'quvchilar, ActivityLog, AttendanceSettings singleton.
// Idempotent: o'zi egalik qiladigan ma'lumotni qayta ishlashdan oldin tozalaydi.

const NOW = new Date();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDate = (from, to) =>
  new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
const chance = (p) => Math.random() < p;
const sample = (arr, n) => {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, Math.min(n, c.length));
};
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const bulkInsert = async (Model, docs, chunkSize = 1000) => {
  let count = 0;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = await Model.insertMany(docs.slice(i, i + chunkSize), {
      ordered: false,
    });
    count += chunk.length;
  }
  return count;
};

const seed = async () => {
  await connectDB();
  const startedAt = Date.now();

  const owner = await User.findOne({ role: ROLES.OWNER }).lean();
  if (!owner) throw new Error("Owner yo'q. Avval `npm run seed:owner`.");
  const teachers = await User.find({ role: ROLES.TEACHER, isActive: true }).lean();
  const groups = await Group.find({ isDeleted: { $ne: true } }).lean();
  if (groups.length === 0 || teachers.length === 0) {
    throw new Error("Avval `npm run seed:fake-data` ishga tushiring.");
  }

  // Idempotent tozalash (faqat shu seed egalik qiladigan ma'lumot)
  await Promise.all([
    Holiday.deleteMany({}),
    TeacherAttendance.deleteMany({}),
    ActivityLog.deleteMany({}),
  ]);

  // ───────── Singleton settings ─────────
  await AttendanceSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  logger.info("Settings singleton tayyor (attendance)");

  // ───────── HOLIDAY ─────────
  const recurring = (name, month, day, message, audience = "all") => ({
    name,
    isRecurring: true,
    month,
    day,
    year: null,
    message,
    audience,
    isActive: true,
    createdBy: owner._id,
  });
  const oneTime = (name, year, month, day, message, audience = "all") => ({
    name,
    isRecurring: false,
    month,
    day,
    year,
    message,
    audience,
    isActive: true,
    createdBy: owner._id,
  });
  const holidayDocs = [
    recurring("Yangi yil", 1, 1, "Yangi yil bilan! Sizga sog'lik va omad."),
    recurring("Xalqaro xotin-qizlar kuni", 3, 8, "8-mart bilan tabriklaymiz!"),
    recurring("Navro'z bayrami", 3, 21, "Navro'z muborak bo'lsin!"),
    recurring("Xotira va qadrlash kuni", 5, 9, "9-may - Xotira va qadrlash kuni."),
    recurring("Mustaqillik kuni", 9, 1, "Mustaqillik bayrami muborak!"),
    recurring("O'qituvchi va murabbiylar kuni", 10, 1, "Bayramingiz bilan, hurmatli ustozlar!", "teachers"),
    recurring("Konstitutsiya kuni", 12, 8, "Konstitutsiya kuni muborak!"),
    // One-time (sanasi yildan-yilga o'zgaradigan diniy bayramlar)
    oneTime("Ramazon hayit", 2026, 3, 20, "Ramazon hayit muborak bo'lsin!"),
    oneTime("Qurbon hayit", 2026, 5, 27, "Qurbon hayit muborak bo'lsin!"),
    oneTime("Markaz tashkil etilgan kun", 2025, 11, 15, "Markazimiz tug'ilgan kuni!", "all"),
  ];
  const holidayKeys = new Set(holidayDocs.map((h) => `${h.month}-${h.day}-${h.year}`));
  await Holiday.insertMany(holidayDocs);
  logger.info(`${holidayDocs.length} ta bayram yaratildi`);

  // ───────── TEACHER ATTENDANCE (manba-haqiqat, per-teacher kunlik) ─────────
  // present = yozuv yo'q; shuning uchun faqat absent/excused yoziladi.
  const from = daysAgo(90);
  const groupsByTeacher = new Map();
  for (const g of groups) {
    for (const t of g.teachers || []) {
      const k = String(t);
      if (!groupsByTeacher.has(k)) groupsByTeacher.set(k, []);
      groupsByTeacher.get(k).push(g);
    }
  }
  const taDocs = [];
  for (const t of teachers) {
    const tGroups = groupsByTeacher.get(String(t._id)) || [];
    const classDayKeys = new Set();
    for (const g of tGroups) {
      for (const cd of getClassDaysInRange(g, from, NOW)) {
        // bayram kuni emasligini tekshiramiz (yangi mantiqqa mos)
        if (holidayKeys.has(`${cd.date.getUTCMonth() + 1}-${cd.date.getUTCDate()}-null`)) continue;
        classDayKeys.add(cd.dateKey);
      }
    }
    const keys = sample([...classDayKeys], randInt(0, 5));
    for (const dateKey of keys) {
      const status = chance(0.6) ? "absent" : "excused";
      const date = new Date(`${dateKey}T05:00:00.000Z`);
      taDocs.push({
        teacher: t._id,
        date,
        dateKey,
        status,
        reason: status === "excused" ? pick(["Kasallik", "Oilaviy sabab", "Majlis"]) : "",
        recordedBy: owner._id,
        recordedAt: date,
      });
    }
  }
  const taCount = await bulkInsert(TeacherAttendance, taDocs);
  logger.info(`${taCount} ta o'qituvchi davomati (absent/excused) yaratildi`);

  // ───────── ATTENDANCE HISTORY (tahrirlangan yozuvlar - ✎ indikatori uchun) ─────────
  const attSample = await Attendance.find({ isDeleted: { $ne: true } })
    .select("status recordedBy recordedAt source")
    .limit(600)
    .lean();
  const toEdit = sample(attSample, Math.min(200, attSample.length));
  const histOps = toEdit.map((a) => {
    const prev = a.status === "present" ? "absent" : "present";
    return {
      updateOne: {
        filter: { _id: a._id },
        update: {
          $set: {
            history: [
              {
                at: a.recordedAt || NOW,
                by: a.recordedBy || owner._id,
                from: prev,
                to: a.status,
                source: a.source || "teacher",
              },
            ],
          },
        },
      },
    };
  });
  if (histOps.length) await Attendance.bulkWrite(histOps, { ordered: false });
  logger.info(`${histOps.length} ta davomat yozuviga tahrir tarixi qo'shildi`);

  // ───────── ARXIVLANGAN O'QUVCHILAR ─────────
  // Arxivlash = isActive:false + faol a'zoliklar yopiladi (leftAt). Bu holatdan keyin
  // generateForPeriod ularga YANGI invoice yozmaydi (savolga amaliy javob).
  const activeStudents = await User.find({
    role: ROLES.STUDENT,
    isActive: true,
    isDeleted: { $ne: true },
  })
    .select("_id")
    .limit(200)
    .lean();
  const toArchive = sample(activeStudents, Math.min(12, activeStudents.length));
  let archivedMemberships = 0;
  for (const s of toArchive) {
    await User.updateOne({ _id: s._id }, { $set: { isActive: false } });
    const res = await GroupMembership.updateMany(
      { student: s._id, leftAt: null, isDeleted: { $ne: true } },
      { $set: { leftAt: NOW, leftReason: "removed" } },
    );
    archivedMemberships += res.modifiedCount || 0;
  }
  logger.info(
    `${toArchive.length} ta o'quvchi arxivlandi (${archivedMemberships} ta a'zolik yopildi)`,
  );

  // ───────── ACTIVITY LOG (audit jurnali) ─────────
  const allUsers = await User.find({ isDeleted: { $ne: true } })
    .select("_id role")
    .limit(200)
    .lean();
  const PATHS = [
    ["POST", "/api/attendance/groups/:id/bulk", "attendance", 201],
    ["GET", "/api/attendance/dashboard", "attendance", 200],
    ["POST", "/api/notifications", "notification", 201],
    ["POST", "/api/groups", "group", 201],
    ["PATCH", "/api/users/:id", "user", 200],
    ["DELETE", "/api/users/:id", "user", 200],
    ["GET", "/api/notifications/:id/recipients", "notification", 403],
    ["POST", "/api/auth/login", "auth", 200],
  ];
  const logDocs = [];
  for (let i = 0; i < 150; i++) {
    const u = chance(0.85) ? pick(allUsers) : null;
    const [method, path, resourceType, status] = pick(PATHS);
    logDocs.push({
      user: u?._id || null,
      userRole: u?.role || "system",
      method,
      path,
      status: chance(0.9) ? status : pick([400, 403, 404, 500]),
      durationMs: randInt(5, 850),
      ip: `213.230.${randInt(0, 255)}.${randInt(1, 254)}`,
      userAgent: pick(["Mozilla/5.0", "PostmanRuntime/7.39", "axios/1.7"]),
      resourceType,
      resourceId: "",
      createdAt: randDate(daysAgo(60), NOW),
    });
  }
  await ActivityLog.insertMany(logDocs);
  logger.info(`${logDocs.length} ta activity log yaratildi`);

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `Fake extras-2 tayyor (${secs}s): ${holidayDocs.length} holiday, ${taCount} teacher-attendance, ${histOps.length} attendance-history, ${toArchive.length} archived-student, ${logDocs.length} activity-log`,
  );
  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Fake extras-2 seed xato");
  process.exit(1);
});
