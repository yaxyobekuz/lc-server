import mongoose from "mongoose";
import Attendance from "../../../models/attendance.model.js";
import AttendanceExemption from "../../../models/attendanceExemption.model.js";
import AttendanceSettings from "../../../models/attendanceSettings.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { buildMeta } from "../../../utils/pagination.js";
import { ROLES } from "../../../constants/roles.js";
import {
  dateKeyOf,
  dayOfWeekOf,
  toUtcMidnight,
  getClassDaysInRange,
  scheduleActiveOn,
  defaultStatusFor,
  withinCourseBounds,
  localTodayMidnight,
  localTodayKey,
  parseLocalDay,
  isHolidayOn,
} from "../../../helpers/attendance.helper.js";
import { holidayKeySetForRange } from "../../holidays/services/holidays.service.js";
import { listForTeacher } from "../../groups/services/groups.service.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import logger from "../../../config/logger.js";
import { correlationCacheInvalidate } from "../../../helpers/correlationCache.js";

// Backward-compat re-export (boshqa modullar shu yerdan import qiladi)
export { correlationCacheInvalidate };

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

// ─── single group + date (+ sessiya) ───
export const listForGroupOnDate = async (groupId, dateInput, slotInput = null) => {
  const group = await ensureGroup(groupId);
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dow = dayOfWeekOf(date);
  // Shu sanada AMAL QILGAN jadval versiyasi (versiyalash)
  const daySlots = scheduleActiveOn(group.schedule, date)
    .filter((s) => s.day === dow)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));

  // Kunning sessiyalari: bir slotli kun → slot=""; ko'p slotli → slot=startTime
  const multi = daySlots.length > 1;
  const sessions = daySlots.map((s) => ({
    slot: multi ? s.startTime : "",
    startTime: s.startTime,
    endTime: s.endTime,
  }));
  // Tanlangan sessiya: berilgan slot yoki birinchi sessiya
  const selectedSlot =
    slotInput !== null && slotInput !== undefined
      ? slotInput
      : sessions[0]?.slot ?? "";

  const holidaySet = await holidayKeySetForRange(date, date);
  const isHoliday = isHolidayOn(holidaySet, date);
  const isClassDay =
    daySlots.length > 0 && withinCourseBounds(group, date) && !isHoliday;

  // Active memberships shu sanada - joinedAt kun ichida bo'lsa ham qamrab olish uchun kun oxiri bilan solishtiramiz
  const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const memberships = await GroupMembership.find({
    group: groupId,
    joinedAt: { $lt: dayEnd },
    $or: [{ leftAt: null }, { leftAt: { $gt: date } }],
    isDeleted: { $ne: true },
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
      slot: selectedSlot,
      isDeleted: { $ne: true },
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
    isHoliday,
    slots: daySlots, // orqaga-moslik
    sessions, // [{ slot, startTime, endTime }] - kunning sessiyalari
    slot: selectedSlot, // tanlangan sessiya
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
  slot = "",
) => {
  const group = await ensureGroup(groupId);
  // Arxivlangan guruhda davomat belgilanmaydi.
  assertGroupActive(group);

  // TEACHER bo'lsa, group.teachers ichida bo'lishi shart
  if (currentUser.role === ROLES.TEACHER) {
    const isOwn = (group.teachers || []).some(
      (t) => String(t) === String(currentUser._id),
    );
    if (!isOwn) {
      throw new ApiError(403, "Bu guruh sizga biriktirilmagan");
    }
  }

  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dKey = dateKeyOf(date);

  // Kelajak sana uchun davomat belgilanmaydi (o'tmishni tuzatish mumkin).
  // "Bugun" mahalliy (Asia/Tashkent) kalendar kuni bo'yicha - yarim tundan keyin
  // ham bugungi davomat belgilanishi uchun.
  if (date.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Kelajak kun uchun davomat belgilab bo'lmaydi");
  }

  // A-5: Kurs chegaralaridan tashqari (guruh boshlanishidan oldin yoki
  // yakunlangach) davomat yozilmaydi. O'qish qatlami bu kunlarni baribir
  // e'tiborsiz qoldiradi, shuning uchun ularni yozmaslik ma'lumotni toza tutadi.
  if (!withinCourseBounds(group, date)) {
    throw new ApiError(
      400,
      "Bu sana guruh kurs muddatidan tashqarida (boshlanishidan oldin yoki yakunlangach)",
    );
  }

  // Faqat guruhning dars kunlari belgilanadi (dars vaqti o'tgan/oldin - farqi yo'q)
  // Shu sanada AMAL QILGAN jadval versiyasi bo'yicha (versiyalash)
  const dow = dayOfWeekOf(date);
  const daySlots = scheduleActiveOn(group.schedule, date).filter(
    (s) => s.day === dow,
  );
  if (daySlots.length === 0) {
    throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
  }
  // Sessiya (slot) tekshiruvi: bir slotli kun → "" ; ko'p slotli → mavjud startTime
  const normalizedSlot = daySlots.length > 1 ? slot || "" : "";
  if (
    daySlots.length > 1 &&
    !daySlots.some((s) => s.startTime === normalizedSlot)
  ) {
    throw new ApiError(400, "Sessiya (dars vaqti) noto'g'ri");
  }
  // Jadval 1→ko'p slotga o'zgargan bo'lsa, eski yozuvlar slot="" bilan qolgan.
  // Ko'p slotli kunning BIRINCHI sloti uchun shu eski yozuvlarni yangi slotga
  // ko'chirish kerak - aks holda slot="" yozuv "yetim" qolib, alohida (phantom)
  // yozuv paydo bo'lardi (BUG-03 double-count). MUHIM: ko'chirish endi barcha
  // validatsiyalardan KEYIN va TRANZAKSIYA ICHIDA bajariladi (quyida) - aks holda
  // request rad etilsa ham yozuv ko'chib qolardi (atomiklik defekti).
  const isFirstSlotOfDay =
    daySlots.length > 1 &&
    normalizedSlot ===
      daySlots
        .map((s) => s.startTime)
        .sort((a, b) => a.localeCompare(b))[0];

  // Bayram/dam olish kuni - davomat belgilanmaydi (foizga ham ta'sir qilmaydi)
  const holidaySet = await holidayKeySetForRange(date, date);
  if (isHolidayOn(holidaySet, date)) {
    throw new ApiError(400, "Bu kun bayram/dam olish kuni - davomat belgilanmaydi");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Hech bo'lmaganda bitta yozuv kerak");
  }
  for (const item of items) validateItem(item);

  // Har bir o'quvchi shu sanada guruhning aktiv a'zosi ekanini tekshiramiz
  const studentIds = items.map((it) => it.studentId);
  // Bir requestda bir o'quvchi takror yuborilmasin: existingMap loop'dan oldin bir
  // marta olinadi va loop ichida yangilanmaydi, shuning uchun takroriy studentId
  // audit history.from'ini buzib, bitta o'zgarish uchun ikkita yozuv qo'shardi.
  if (new Set(studentIds.map(String)).size !== studentIds.length) {
    throw new ApiError(400, "Bir o'quvchi bir necha marta yuborildi");
  }
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
      throw new ApiError(
        400,
        "O'quvchi bu sanada guruhning aktiv a'zosi emas",
      );
    }
  }

  // existingMap tranzaksiya ichida to'ldiriladi (legacy slot ko'chirishdan KEYIN),
  // lekin tranzaksiyadan keyin notifyConsecutiveAbsences ham ishlatadi - shuning
  // uchun tashqi scope'da e'lon qilamiz.
  const existingMap = new Map();

  const results = await runWithSession(async (session) => {
    const opts = session ? { session } : {};

    // Legacy slot="" → birinchi slotga ko'chirish (BUG-03) - validatsiyadan keyin,
    // upsert'lardan oldin, tranzaksiya ichida (atomik, rad etilsa rollback bo'ladi).
    if (isFirstSlotOfDay) {
      await Attendance.updateMany(
        {
          group: groupId,
          student: { $in: studentIds },
          dateKey: dKey,
          slot: "",
          isDeleted: { $ne: true },
        },
        { $set: { slot: normalizedSlot } },
        opts,
      );
    }

    // Audit: mavjud yozuvlarni ko'chirishdan KEYIN olamiz - holat o'zgarsa tarixga
    // yozish va birinchi slot ko'chirilgan yozuvni ko'rishi uchun.
    existingMap.clear();
    const existing = await Attendance.find(
      {
        group: groupId,
        student: { $in: studentIds },
        dateKey: dKey,
        slot: normalizedSlot,
        isDeleted: { $ne: true },
      },
      null,
      opts,
    );
    for (const a of existing) existingMap.set(String(a.student), a);

    const docs = [];
    for (const item of items) {
      const prev = existingMap.get(String(item.studentId));
      const changed = !prev || prev.status !== item.status;
      const update = {
        $set: {
          status: item.status,
          reason: item.reason || "",
          lateMinutes: item.lateMinutes || 0,
          recordedBy: currentUser._id,
          recordedAt: new Date(),
          source,
          isDeleted: false, // qayta belgilansa - soft-delete bekor qilinadi
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
            from: prev ? prev.status : null,
            to: item.status,
            source,
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
        doc = await Attendance.findOneAndUpdate(filter, update, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          ...opts,
        });
      } catch (err) {
        // Bir vaqtning o'zida birinchi marta saqlanganda unique-index poygasi:
        // yozuv endi mavjud - upsert'siz qayta urinib ko'ramiz.
        if (err?.code === 11000) {
          delete update.$setOnInsert;
          doc = await Attendance.findOneAndUpdate(filter, update, {
            new: true,
            ...opts,
          });
        } else {
          throw err;
        }
      }
      docs.push(doc);
    }
    return docs;
  });

  // Davomat o'zgardi → correlation cache'ni shu oy uchun bekor qilamiz
  correlationCacheInvalidate(date.getUTCFullYear(), date.getUTCMonth() + 1);

  // Ketma-ket qoldirish ogohlantirishi (yangi "absent" bo'lganlar uchun) - bloklamaydi
  notifyConsecutiveAbsences({ group, items, existingMap, dateKey: dKey }).catch(
    (err) =>
      logger.warn({ err }, "Ketma-ket qoldirish ogohlantirishi yuborilmadi"),
  );

  return results;
};

// Ketma-ket qoldirish chegarasiga yangi yetgan o'quvchilar uchun egasi va
// o'qituvchilarga ogohlantirish yuboradi. Chegaraga TENG bo'lganda bir marta ishlaydi.
const notifyConsecutiveAbsences = async ({ group, items, existingMap, dateKey }) => {
  const settings = await getSettings();
  const threshold = settings.consecutiveAbsencesAlert || 0;
  if (threshold < 1) return;

  // Faqat yangi yoki absent'ga o'zgartirilgan yozuvlar
  const candidates = items.filter((it) => {
    if (it.status !== "absent") return false;
    const prev = existingMap.get(String(it.studentId));
    return !prev || prev.status !== "absent";
  });
  if (candidates.length === 0) return;

  const crossed = [];
  for (const it of candidates) {
    // Faqat shu guruh bo'yicha ketma-ket qoldirish
    const count = await consecutiveAbsences(it.studentId, group._id);
    if (count === threshold) crossed.push(it.studentId);
  }
  if (crossed.length === 0) return;

  const [students, owners, { send }] = await Promise.all([
    User.find({ _id: { $in: crossed } }, STUDENT_PROJECTION).lean(),
    User.find(
      { role: ROLES.OWNER, isActive: true, isDeleted: { $ne: true } },
      { _id: 1 },
    ).lean(),
    import("../../notifications/services/notifications.service.js"),
  ]);

  const recipientSet = new Set(owners.map((o) => String(o._id)));
  for (const t of group.teachers || []) recipientSet.add(String(t));
  const userIds = [...recipientSet];
  if (userIds.length === 0) return;

  for (const stu of students) {
    const name = `${stu.lastName || ""} ${stu.firstName || ""}`.trim();
    await send(
      {
        title: "Davomat ogohlantirishi",
        body: `${name} ketma-ket ${threshold} marta darsga kelmadi.\nGuruh: ${group.name}`,
        category: "attendance",
        audience: { type: "auto_system", userIds },
        isAuto: true,
        // Bir o'quvchi-guruh-kun bo'yicha bir marta (qayta belgilashda dublikat bo'lmasin)
        dedupeKey: `consec:${String(stu._id)}:${String(group._id)}:${dateKey}`,
      },
      null,
    );
  }
};

// ─── monthly + summary ───
// leftAt EXCLUSIVE semantikasi: leftAt = chiqilgan kun yarim tuni, ya'ni shu kun
// ARTIQ a'zolik emas (belgilash yo'li `leftAt > date` bilan bir xil). Oxirgi faol
// kun = leftAt'dan oldingi kun. Class-day oralig'ining yuqori chegarasi sifatida
// shuni qaytaramiz, shunda chiqilgan kun maxrajga kirmaydi va grid'da
// "to'ldirib bo'lmaydigan" ghost katak paydo bo'lmaydi.
const DAY_MS = 24 * 60 * 60 * 1000;
const lastActiveDayBefore = (leftAt) =>
  new Date(toUtcMidnight(leftAt).getTime() - DAY_MS);

const startOfMonth = (year, month) =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
const endOfMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

// O'quvchining [rangeStart, rangeEnd] oralig'idagi class-day xaritasi (har guruh × sana → status)
const buildStudentClassDays = async (
  studentId,
  rangeStart,
  rangeEnd,
  scopeGroupIds = null,
) => {
  // Shu oraliqda active bo'lgan memberships.
  // scopeGroupIds berilsa (o'qituvchi so'rovi) - faqat shu guruhlar bilan
  // cheklaymiz, aks holda o'qituvchi o'zi o'qitmaydigan guruhlardagi
  // davomatni ham ko'rib qolardi (A-1 cross-group disclosure).
  const membershipFilter = {
    student: studentId,
    joinedAt: { $lte: rangeEnd },
    $or: [{ leftAt: null }, { leftAt: { $gte: rangeStart } }],
    isDeleted: { $ne: true },
  };
  if (scopeGroupIds) membershipFilter.group = { $in: scopeGroupIds };
  const memberships = await GroupMembership.find(membershipFilter).populate(
    "group",
  );

  const [exemptions, holidaySet] = await Promise.all([
    AttendanceExemption.find({
      student: studentId,
      isActive: true,
    }),
    holidayKeySetForRange(rangeStart, rangeEnd),
  ]);

  const groups = [];
  const dKeys = new Set();

  for (const m of memberships) {
    if (!m.group) continue;
    // Shu membershipning effective range'i oraliq ichida
    const effFrom =
      m.joinedAt > rangeStart ? toUtcMidnight(m.joinedAt) : rangeStart;
    // leftAt EXCLUSIVE - oxirgi faol kun leftAt'dan oldingi kun
    const leftBound = m.leftAt ? lastActiveDayBefore(m.leftAt) : null;
    let effTo = leftBound && leftBound < rangeEnd ? leftBound : rangeEnd;
    // Kurs tugagan bo'lsa - endDate'dan keyin dars kuni yo'q
    if (m.group.endDate) {
      const fin = toUtcMidnight(m.group.endDate);
      if (fin < effTo) effTo = fin;
    }

    const classDays = getClassDaysInRange(m.group, effFrom, effTo, holidaySet);
    const days = classDays
      .map((cd) => {
        const def = defaultStatusFor(exemptions, cd.date, cd.dayOfWeek);
        dKeys.add(cd.dateKey);
        return {
          date: cd.date,
          dateKey: cd.dateKey,
          dayOfWeek: cd.dayOfWeek,
          slot: cd.slot || "",
          isFirstSlot: cd.isFirstSlot,
          startTime: cd.startTime,
          endTime: cd.endTime,
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
    isDeleted: { $ne: true },
  });
  // group|dateKey -> Map(slot -> att) - slot-fallback (jadval o'zgarishi) uchun
  const byDay = buildAttBySlot(attendances);

  for (const g of groups) {
    const used = new Set();
    for (const d of g.days) {
      const att = matchAttendanceForCell(
        byDay,
        {
          groupId: g.group._id,
          dateKey: d.dateKey,
          slot: d.slot,
          isFirstSlot: d.isFirstSlot,
        },
        used,
      );
      d.attendance = att?.toJSON() || null;
    }
  }

  return groups;
};

// O'quvchining bir oy ichidagi class-day xaritasi (har guruh × sana → status)
export const getStudentMonthly = async (
  studentId,
  { year, month, scopeGroupIds = null },
) => {
  const groups = await buildStudentClassDays(
    studentId,
    startOfMonth(year, month),
    endOfMonth(year, month),
    scopeGroupIds,
  );
  return { studentId, year, month, groups };
};

// O'quvchining butun yil bo'yicha class-day xaritasi (yillik heatmap uchun)
export const getStudentYear = async (
  studentId,
  { year, scopeGroupIds = null },
) => {
  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const groups = await buildStudentClassDays(
    studentId,
    yearStart,
    yearEnd,
    scopeGroupIds,
  );
  return { studentId, year, groups };
};

// ─── guruh bo'yicha oylik matritsa (o'quvchi × sana) ───
export const getGroupMonthly = async (groupId, { year, month }) => {
  const group = await ensureGroup(groupId);
  const monthStart = startOfMonth(year, month);
  const monthEnd = endOfMonth(year, month);

  const holidaySet = await holidayKeySetForRange(monthStart, monthEnd);

  // Har ustun bitta SESSIYA: kunda bir nechta dars bo'lsa - bir nechta ustun.
  // colKey - kataklar kaliti (bir slotli/no-class kunda = dateKey; ko'p slotli kunda = dateKey__HH:mm)
  // Slotlar har sana uchun o'sha sanada AMAL QILGAN versiyadan olinadi (versiyalash).
  const dates = [];
  const dateKeys = new Set();
  const cur = new Date(monthStart);
  while (cur.getTime() <= monthEnd.getTime()) {
    const dow = dayOfWeekOf(cur);
    const dKey = dateKeyOf(cur);
    dateKeys.add(dKey);
    const daySlots = scheduleActiveOn(group.schedule, cur)
      .filter((s) => s.day === dow)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
    const inBounds = withinCourseBounds(group, cur) && !holidaySet.has(dKey);
    const isClassDay = daySlots.length > 0 && inBounds;
    if (isClassDay && daySlots.length > 1) {
      daySlots.forEach((s, idx) => {
        dates.push({
          date: new Date(cur),
          dateKey: dKey,
          colKey: `${dKey}__${s.startTime}`,
          slot: s.startTime,
          startTime: s.startTime,
          dayOfWeek: dow,
          isClassDay: true,
          isFirstSlot: idx === 0,
          isHoliday: holidaySet.has(dKey),
        });
      });
    } else {
      dates.push({
        date: new Date(cur),
        dateKey: dKey,
        colKey: dKey,
        slot: "",
        startTime: daySlots[0]?.startTime || null,
        dayOfWeek: dow,
        isClassDay,
        isFirstSlot: true,
        isHoliday: holidaySet.has(dKey),
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const memberships = await GroupMembership.find({
    group: groupId,
    joinedAt: { $lte: monthEnd },
    $or: [{ leftAt: null }, { leftAt: { $gte: monthStart } }],
    isDeleted: { $ne: true },
  }).populate("student", STUDENT_PROJECTION);

  const activeMemberships = memberships.filter((m) => m.student);
  const studentIds = activeMemberships.map((m) => m.student._id);

  const [attendances, exemptions] = await Promise.all([
    Attendance.find({
      group: groupId,
      student: { $in: studentIds },
      dateKey: { $in: Array.from(dateKeys) },
      isDeleted: { $ne: true },
    }).lean(),
    AttendanceExemption.find({
      student: { $in: studentIds },
      isActive: true,
    }),
  ]);

  // student|dateKey -> Map(slot -> att) - slot-fallback (jadval o'zgarishi) uchun
  const attByStudentDay = new Map();
  for (const a of attendances) {
    const k = `${String(a.student)}|${a.dateKey}`;
    if (!attByStudentDay.has(k)) attByStudentDay.set(k, new Map());
    attByStudentDay.get(k).set(a.slot || "", a);
  }
  const exempMap = new Map();
  for (const ex of exemptions) {
    const key = String(ex.student);
    if (!exempMap.has(key)) exempMap.set(key, []);
    exempMap.get(key).push(ex);
  }

  // Bir o'quvchining bir oy ichida bir nechta a'zoligi bo'lishi mumkin
  // (guruhdan chiqarilib, keyin qayta qabul qilingan holatda). Ularni BITTA
  // qatorga birlashtiramiz - aks holda o'quvchi davomat jadvalida ikki marta
  // (dublikat) ko'rinardi. Har bir o'quvchi uchun barcha [joined, left]
  // oraliqlarini saqlaymiz va katak shu oraliqlarning birortasiga tushsa - faol.
  const byStudent = new Map();
  for (const m of activeMemberships) {
    const sid = String(m.student._id);
    if (!byStudent.has(sid)) {
      byStudent.set(sid, { student: m.student, intervals: [] });
    }
    byStudent.get(sid).intervals.push({
      joinedTs: toUtcMidnight(m.joinedAt).getTime(),
      leftTs: m.leftAt ? toUtcMidnight(m.leftAt).getTime() : null,
    });
  }

  const students = Array.from(byStudent.values()).map(({ student, intervals }) => {
    const sid = String(student._id);
    const stuExemptions = exempMap.get(sid) || [];
    // Katak (sana) o'quvchining a'zolik oraliqlaridan biriga tushadimi?
    // leftTs EXCLUSIVE (ts < leftTs): chiqilgan kun yarim tuni endi a'zolik emas -
    // belgilash yo'li (`leftAt > date`) va computeClassDays bilan bir xil chegara.
    const isMemberOn = (ts) =>
      intervals.some(
        (iv) => ts >= iv.joinedTs && (iv.leftTs === null || ts < iv.leftTs),
      );

    const dayMap = attByStudentDay; // student|dateKey -> Map(slot->att)
    const usedAtt = new Set(); // bir yozuv faqat bir cell uchun
    const cells = {};
    for (const d of dates) {
      const ts = d.date.getTime();
      const key = d.colKey;
      if (!d.isClassDay) {
        cells[key] = null;
        continue;
      }
      if (!isMemberOn(ts)) {
        cells[key] = null;
        continue;
      }
      const slots = dayMap.get(`${sid}|${d.dateKey}`);
      const want = d.slot || "";
      let att = slots ? slots.get(want) : undefined;
      // Jadval keyinroq o'zgargan bo'lsa eski yozuvni shu kunning katagiga
      // bog'laymiz (ikki yo'nalishli - yo'qolmasin, ikki marta sanalmasin):
      //   • 1→ko'p : birinchi slot eski slot="" yozuvini oladi
      //   • ko'p→1 : bir slotli kun eski slot="HH:mm" yozuvini oladi
      if (!att && d.isFirstSlot && slots) {
        if (want !== "") {
          const legacy = slots.get("");
          if (legacy && !usedAtt.has(legacy)) att = legacy;
        } else {
          att = earliestUnusedSlotDoc(slots, usedAtt) || undefined;
        }
      }
      if (att) {
        if (usedAtt.has(att)) att = undefined;
        else usedAtt.add(att);
      }
      const def = defaultStatusFor(stuExemptions, d.date, d.dayOfWeek);
      cells[key] = att
        ? {
            status: att.status,
            defaultStatus: def,
            reason: att.reason || "",
            lateMinutes: att.lateMinutes || 0,
          }
        : { status: null, defaultStatus: def, reason: "", lateMinutes: 0 };
    }

    return {
      student: student.toJSON(),
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

// ─── davomat foizi (yagona ta'rif) ───
// Surat  = kelgan (present)
// Maxraj = present + absent   → BELGILANGAN, hisobga olinadigan kunlar
//   • exempt (imtiyoz) - maxrajdan tashqarida (foizga ta'sir qilmaydi)
//   • excused (sababli) - maxrajdan tashqarida (o'quvchini jazolamaydi)
//   • unmarked (belgilanmagan) - counts'ga umuman tushmaydi → maxrajga kirmaydi
//     (o'qituvchi belgilamagani o'quvchining foizini pasaytirmaydi)
// Eslatma: tizimda "late" alohida status emas (kechikish lateMinutes maydonida
// saqlanadi). late = present yozuvlarning lateMinutes>0 bo'lgan KICHIK TO'PLAMI -
// faqat informatsion son, foizga ham, total'ga ham ta'sir qilmaydi (kechikkan
// o'quvchi baribir "kelgan" deb hisoblanadi).
// Shu yagona funksiya barcha joyda (o'quvchi/guruh/dashboard) ishlatiladi.
export const computeRate = (counts) => {
  const numer = counts.present;
  const denom = counts.present + counts.absent;
  return denom > 0 ? Math.round((numer / denom) * 100) : null;
};

// ─── summary (o'quvchi bo'yicha) ───
const buildSummaryFromBuckets = (counts) => {
  // late - present'ning KICHIK TO'PLAMI (kechikib kelganlar soni), shuning uchun
  // total'ga QO'SHILMAYDI (aks holda kechikkan o'quvchi ikki marta sanaladi).
  const total =
    counts.present + counts.absent + counts.excused + counts.exempt;
  return {
    totalClasses: total,
    present: counts.present,
    absent: counts.absent,
    excused: counts.excused,
    late: counts.late, // present ichidan nechtasi kechikkan (informatsion)
    exempt: counts.exempt,
    attendanceRate: computeRate(counts),
  };
};

// Pure: membership + exemption ro'yxatidan [from,to] oralig'idagi class-day cell'lar.
// holidaySet - bayram kunlari (dateKey) class-day deb hisoblanmaydi.
const computeClassDays = ({
  memberships,
  exemptions,
  from,
  to,
  holidaySet = null,
}) => {
  let total = 0;
  let exemptDefault = 0;
  const cells = [];
  // Bitta o'quvchining bir nechta a'zoligi (chiqarib-qayta qabul qilingan)
  // bir xil kunni qamrab olishi mumkin - har bir (group, dateKey, slot) katagini
  // faqat bir marta sanaymiz (dublikat / ikki marta hisoblanmasin).
  const seenCells = new Set();

  for (const m of memberships) {
    if (!m.group) continue;
    const effFrom = m.joinedAt > from ? m.joinedAt : from;
    // leftAt EXCLUSIVE - oxirgi faol kun leftAt'dan oldingi kun (lastActiveDayBefore)
    const leftBound = m.leftAt ? lastActiveDayBefore(m.leftAt) : null;
    let effTo = leftBound && leftBound < to ? leftBound : to;
    if (m.group.endDate) {
      const fin = toUtcMidnight(m.group.endDate);
      if (fin < effTo) effTo = fin;
    }
    const classDays = getClassDaysInRange(m.group, effFrom, effTo, holidaySet);
    for (const cd of classDays) {
      const cellKey = `${String(m.group._id)}|${cd.dateKey}|${cd.slot || ""}`;
      if (seenCells.has(cellKey)) continue;
      seenCells.add(cellKey);
      total += 1;
      const def = defaultStatusFor(exemptions, cd.date, cd.dayOfWeek);
      const isExemptDefault = def === "exempt";
      if (isExemptDefault) exemptDefault += 1;
      cells.push({
        groupId: m.group._id,
        dateKey: cd.dateKey,
        slot: cd.slot || "",
        isFirstSlot: cd.isFirstSlot,
        exemptDefault: isExemptDefault,
      });
    }
  }
  return { total, exemptDefault, cells };
};

// Attendance yozuvlarini (group, dateKey) bo'yicha guruhlaydi - slot-fallback uchun.
// Map: "group|dateKey" -> Map(slot -> doc)
const buildAttBySlot = (attendances) => {
  const byDay = new Map();
  for (const a of attendances) {
    const dayKey = `${String(a.group)}|${a.dateKey}`;
    if (!byDay.has(dayKey)) byDay.set(dayKey, new Map());
    byDay.get(dayKey).set(a.slot || "", a);
  }
  return byDay;
};

// Bir kun ichidagi yozuvlardan (slot -> doc) eng erta (vaqt bo'yicha) bo'sh
// bo'lmagan slotli, hali ishlatilmagan yozuvni qaytaradi. Jadval ko'p→1 slotga
// qaytarilganda eski slot="HH:mm" yozuvini bir slotli kunning katagiga
// bog'lash uchun ishlatiladi (BUG: reverse slot-fallback yo'q edi).
const earliestUnusedSlotDoc = (slots, used) => {
  const keys = Array.from(slots.keys())
    .filter((k) => k !== "")
    .sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    const d = slots.get(k);
    if (d && !used.has(d)) return d;
  }
  return null;
};

// Berilgan cell uchun attendance yozuvini topadi.
// Avval aniq slot bo'yicha; topilmasa - guruh jadvali keyinroq o'zgargan
// holatda eski yozuvni shu kunning katagiga bog'laymiz (ikki yo'nalishli):
//   • 1 → ko'p slot : ko'p slotli kunning BIRINCHI sloti eski slot="" yozuvini oladi
//   • ko'p → 1 slot : bir slotli kun (want="") eski slot="HH:mm" yozuvini oladi
// Shunday qilib jadval o'zgarganda eski yozuv yo'qolmaydi va bir kun ikki marta
// sanalmaydi. Ishlatilgan yozuv used setiga qo'shiladi.
const matchAttendanceForCell = (byDay, cell, used) => {
  const dayKey = `${String(cell.groupId)}|${cell.dateKey}`;
  const slots = byDay.get(dayKey);
  if (!slots) return null;
  const want = cell.slot || "";
  let doc = slots.get(want);
  if (!doc && cell.isFirstSlot) {
    if (want !== "") {
      // 1→ko'p: birinchi slot eski slot="" yozuviga fallback
      const legacy = slots.get("");
      if (legacy && !used.has(legacy)) doc = legacy;
    } else {
      // ko'p→1: bir slotli kun eski bo'sh bo'lmagan slotli yozuvga fallback
      doc = earliestUnusedSlotDoc(slots, used);
    }
  }
  if (doc) {
    if (used.has(doc)) return null; // bir yozuv faqat bir cell uchun
    used.add(doc);
  }
  return doc || null;
};

// Pure: class-day cell'lar + attendance yozuvlaridan summary. attendances cell'lardan
// keng bo'lishi mumkin - faqat mos group|dateKey lar hisobga olinadi.
const summarizeCells = ({ total, cells, attendances }) => {
  if (total === 0) {
    return buildSummaryFromBuckets({
      present: 0,
      absent: 0,
      excused: 0,
      late: 0,
      exempt: 0,
    });
  }

  const byDay = buildAttBySlot(attendances);
  const used = new Set();

  const counts = { present: 0, absent: 0, excused: 0, late: 0, exempt: 0 };
  let exemptUnmarked = 0;
  for (const c of cells) {
    const a = matchAttendanceForCell(byDay, c, used);
    if (a) {
      counts[a.status] = (counts[a.status] || 0) + 1;
      // late - alohida status emas; kelgan (present) yozuvning lateMinutes>0
      // bo'lishi. present'ning KICHIK TO'PLAMI sifatida sanaymiz (total'ga
      // qo'shilmaydi).
      if (a.status === "present" && (a.lateMinutes || 0) > 0) counts.late += 1;
    } else if (c.exemptDefault) {
      // FAQAT belgilanmagan exempt-default kunlar avto-exempt hisoblanadi
      // (belgilangan exempt-default kun yuqorida o'z statusi bilan sanaladi)
      exemptUnmarked += 1;
    }
    // boshqa belgilanmagan kunlar hech qaysi bucket'ga qo'shilmaydi
  }
  counts.exempt += exemptUnmarked;
  // late present ichida sanalgani uchun markedTotal'ga QO'SHILMAYDI
  const markedTotal =
    counts.present + counts.absent + counts.excused + counts.exempt;
  const summary = buildSummaryFromBuckets(counts);
  summary.totalClasses = total; // total class days (belgilanganmi yoki yo'q)
  summary.unmarked = total - markedTotal;
  return summary;
};

export const getStudentSummary = async (
  studentId,
  { fromDate, toDate, scopeGroupIds = null } = {},
) => {
  if (!fromDate || !toDate) {
    return summarizeCells({ total: 0, exemptDefault: 0, cells: [], attendances: [] });
  }
  const from = parseLocalDay(fromDate);
  const to = parseLocalDay(toDate);

  // scopeGroupIds berilsa (o'qituvchi) - faqat shu guruhlar (A-1 fix)
  const membershipFilter = {
    student: studentId,
    joinedAt: { $lte: to },
    $or: [{ leftAt: null }, { leftAt: { $gte: from } }],
    isDeleted: { $ne: true },
  };
  if (scopeGroupIds) membershipFilter.group = { $in: scopeGroupIds };

  const [memberships, exemptions, holidaySet] = await Promise.all([
    GroupMembership.find(membershipFilter).populate("group"),
    AttendanceExemption.find({ student: studentId, isActive: true }),
    holidayKeySetForRange(from, to),
  ]);

  const { total, exemptDefault, cells } = computeClassDays({
    memberships,
    exemptions,
    from,
    to,
    holidaySet,
  });

  if (total === 0) {
    return summarizeCells({ total: 0, exemptDefault: 0, cells: [], attendances: [] });
  }

  const dKeys = Array.from(new Set(cells.map((c) => c.dateKey)));
  const attendances = await Attendance.find({
    student: studentId,
    dateKey: { $in: dKeys },
    isDeleted: { $ne: true },
  }).lean();

  return summarizeCells({ total, cells, attendances });
};

// ─── group summary ───
export const getGroupSummary = async (groupId, { fromDate, toDate }) => {
  const group = await ensureGroup(groupId);
  const from = parseLocalDay(fromDate);
  const to = parseLocalDay(toDate);

  // Diapazonda active bo'lgan barcha memberships
  const memberships = await GroupMembership.find({
    group: groupId,
    joinedAt: { $lte: to },
    $or: [{ leftAt: null }, { leftAt: { $gte: from } }],
    isDeleted: { $ne: true },
  }).populate("student", STUDENT_PROJECTION);

  const studentIds = memberships.filter((m) => m.student).map((m) => m.student._id);
  const [exemptions, holidaySet] = await Promise.all([
    AttendanceExemption.find({
      student: { $in: studentIds },
      isActive: true,
    }),
    holidayKeySetForRange(from, to),
  ]);
  const exempByStudent = new Map();
  for (const ex of exemptions) {
    const k = String(ex.student);
    if (!exempByStudent.has(k)) exempByStudent.set(k, []);
    exempByStudent.get(k).push(ex);
  }

  // Bir o'quvchining bir nechta a'zoligini (chiqarilib, qayta qabul qilingan)
  // BITTA o'quvchi sifatida birlashtiramiz - aks holda hisobotda dublikat
  // qator chiqib, davomat ikki marta sanalardi.
  const membershipsByStudent = new Map(); // sid -> { student, intervals: [{joinedAt,leftAt}] }
  for (const m of memberships) {
    if (!m.student) continue;
    const sid = String(m.student._id);
    if (!membershipsByStudent.has(sid)) {
      membershipsByStudent.set(sid, { student: m.student, intervals: [] });
    }
    membershipsByStudent.get(sid).intervals.push({
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
      group,
    });
  }

  // Har o'quvchi uchun shu guruhdagi class-day cell'larini oldindan hisoblaymiz
  const perStudentCells = new Map(); // sid -> { total, cells }
  const allDKeys = new Set();
  for (const [sid, { intervals }] of membershipsByStudent) {
    const { total, cells } = computeClassDays({
      memberships: intervals,
      exemptions: exempByStudent.get(sid) || [],
      from,
      to,
      holidaySet,
    });
    perStudentCells.set(sid, { total, cells });
    for (const c of cells) allDKeys.add(c.dateKey);
  }

  // Barcha o'quvchilarning attendance yozuvlarini BITTA so'rovda olamiz (N+1 yo'q)
  const allAttendances = await Attendance.find({
    group: groupId,
    student: { $in: studentIds },
    dateKey: { $in: Array.from(allDKeys) },
    isDeleted: { $ne: true },
  }).lean();
  const attByStudent = new Map();
  for (const a of allAttendances) {
    const k = String(a.student);
    if (!attByStudent.has(k)) attByStudent.set(k, []);
    attByStudent.get(k).push(a);
  }

  const perStudent = [];
  let aggregate = {
    present: 0,
    absent: 0,
    excused: 0,
    late: 0,
    exempt: 0,
    unmarked: 0,
    totalClasses: 0,
  };

  for (const [sid, { student }] of membershipsByStudent) {
    const { total, cells } = perStudentCells.get(sid) || { total: 0, cells: [] };
    const summary = summarizeCells({
      total,
      cells,
      attendances: attByStudent.get(sid) || [],
    });
    perStudent.push({
      student: student.toJSON(),
      summary,
    });
    aggregate.present += summary.present;
    aggregate.absent += summary.absent;
    aggregate.excused += summary.excused;
    aggregate.late += summary.late;
    aggregate.exempt += summary.exempt;
    aggregate.unmarked += summary.unmarked || 0;
    aggregate.totalClasses += summary.totalClasses;
  }

  const groupRate = computeRate(aggregate);

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
  const from = parseLocalDay(fromDate);
  const to = parseLocalDay(toDate);

  const groups = await Group.find({ isActive: true, isDeleted: { $ne: true } });
  const groupIds = groups.map((g) => g._id);

  // Oraliqda active bo'lgan guruh membershiplari (groupBreakdown + o'quvchilar ro'yxati uchun)
  const groupMemberships = await GroupMembership.find({
    group: { $in: groupIds },
    joinedAt: { $lte: to },
    $or: [{ leftAt: null }, { leftAt: { $gte: from } }],
    isDeleted: { $ne: true },
  }).populate("student", STUDENT_PROJECTION);

  const studentIdSet = new Set();
  for (const m of groupMemberships) {
    if (m.student) studentIdSet.add(String(m.student._id));
  }
  const studentIds = Array.from(studentIdSet).map(
    (id) => new mongoose.Types.ObjectId(id),
  );

  // Shu o'quvchilarning AKTIV guruhlardagi membershiplari + exemptions + attendances.
  // `group: { $in: groupIds }` bilan cheklaymiz (groupIds = faqat aktiv, o'chirilmagan
  // guruhlar) - aks holda aggregate nofaol/o'chirilgan guruhlardan dars kunlarini
  // qo'shib, groupBreakdown (faqat aktiv guruhlarni ko'rsatadi) bilan ziddiyatga
  // kelardi: aggregate.totalClasses ≠ Σ groupBreakdown.totalClasses.
  const [allMemberships, exemptions, attendances, holidaySet] =
    await Promise.all([
      GroupMembership.find({
        student: { $in: studentIds },
        group: { $in: groupIds },
        joinedAt: { $lte: to },
        $or: [{ leftAt: null }, { leftAt: { $gte: from } }],
        isDeleted: { $ne: true },
      }).populate("group"),
      AttendanceExemption.find({ student: { $in: studentIds }, isActive: true }),
      // dateKey bo'yicha filtrlaymiz (date emas) - summary yo'llari bilan bir xil
      // kun semantikasi. Aks holda `date` maydonida vaqt komponenti bo'lgan
      // (seed/legacy) yozuvlar oraliq oxirgi kunida tushib qolib, dashboard
      // ko'rsatkichlari summary bilan ziddiyatga kelardi.
      Attendance.find({
        student: { $in: studentIds },
        dateKey: { $gte: dateKeyOf(from), $lte: dateKeyOf(to) },
        isDeleted: { $ne: true },
      }).lean(),
      holidayKeySetForRange(from, to),
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

  const studentDocById = new Map();
  for (const m of groupMemberships) {
    if (m.student) studentDocById.set(String(m.student._id), m.student);
  }

  // ── Per-o'quvchi (cross-group) summary - overall + studentList uchun, HAR BIRI BIR MARTA ──
  // (att-correctness-2: oldin har guruh a'zoligi uchun takror qo'shilib, ko'p guruhdagi
  //  o'quvchi sonlarini N marta shishirardi)
  let aggregate = {
    present: 0,
    absent: 0,
    excused: 0,
    late: 0,
    exempt: 0,
    unmarked: 0,
    totalClasses: 0,
  };
  const studentRates = new Map();
  for (const sid of studentIdSet) {
    const { total, cells } = computeClassDays({
      memberships: membershipsByStudent.get(sid) || [],
      exemptions: exemptionsByStudent.get(sid) || [],
      from,
      to,
      holidaySet,
    });
    const s = summarizeCells({
      total,
      cells,
      attendances: attendancesByStudent.get(sid) || [],
    });
    aggregate.present += s.present;
    aggregate.absent += s.absent;
    aggregate.excused += s.excused;
    aggregate.late += s.late;
    aggregate.exempt += s.exempt;
    aggregate.unmarked += s.unmarked || 0;
    aggregate.totalClasses += s.totalClasses;

    const doc = studentDocById.get(sid);
    studentRates.set(sid, {
      student: doc ? doc.toJSON() : { _id: sid },
      present: s.present,
      absent: s.absent,
      late: s.late,
      exempt: s.exempt,
      excused: s.excused,
      totalClasses: s.totalClasses,
    });
  }

  // ── Guruh breakdown - HAR BIR (o'quvchi,guruh) SHU GURUH bo'yicha alohida hisoblanadi ──
  // (att-correctness-1: oldin cross-group summary guruhga qo'shilib, guruh foizига
  //  begona guruhlar davomatini aralashtirardi)
  const membershipsByGroup = groupBy(
    groupMemberships.filter((m) => m.student),
    (m) => String(m.group),
  );
  const groupBreakdownAll = [];

  for (const g of groups) {
    const members = membershipsByGroup.get(String(g._id)) || [];
    const gAgg = {
      present: 0,
      absent: 0,
      excused: 0,
      late: 0,
      exempt: 0,
      unmarked: 0,
      totalClasses: 0,
    };

    for (const m of members) {
      const sid = String(m.student._id);
      // FAQAT shu guruh bo'yicha (getGroupSummary bilan bir xil scope)
      const { total, cells } = computeClassDays({
        memberships: [{ joinedAt: m.joinedAt, leftAt: m.leftAt, group: g }],
        exemptions: exemptionsByStudent.get(sid) || [],
        from,
        to,
        holidaySet,
      });
      // cells faqat shu guruh|dateKey larni o'z ichiga oladi → summarizeCells
      // o'quvchining boshqa guruh yozuvlarini e'tiborsiz qoldiradi
      const s = summarizeCells({
        total,
        cells,
        attendances: attendancesByStudent.get(sid) || [],
      });
      gAgg.present += s.present;
      gAgg.absent += s.absent;
      gAgg.excused += s.excused;
      gAgg.late += s.late;
      gAgg.exempt += s.exempt;
      gAgg.unmarked += s.unmarked || 0;
      gAgg.totalClasses += s.totalClasses;
    }

    groupBreakdownAll.push({
      groupId: g._id,
      name: g.name,
      groupRate: computeRate(gAgg),
      totalClasses: gAgg.totalClasses,
    });
  }

  const overallRate = computeRate(aggregate);

  // Per-student rates
  const studentList = Array.from(studentRates.values()).map((s) => ({
    ...s,
    rate: computeRate(s),
  }));

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

// ─── consecutive absences ───
// groupId berilsa - faqat shu guruh bo'yicha (aks holda barcha guruhlar bo'yicha).
// Soft-deleted va kelajak sanali yozuvlar hisobga olinmaydi.
export const consecutiveAbsences = async (studentId, groupId = null) => {
  // dateKey bo'yicha (date emas): dateKey har doim normalizatsiyalangan
  // YYYY-MM-DD, vaqt komponentidan xoli. `date` bilan solishtirilsa, seed/legacy
  // yozuvlardagi vaqt tufayli bugungi qoldirish "kelajak" deb tushib qolardi.
  const filter = {
    student: studentId,
    isDeleted: { $ne: true },
    dateKey: { $lte: localTodayKey() },
  };
  if (groupId) filter.group = groupId;
  const recent = await Attendance.find(filter)
    .sort({ dateKey: -1 })
    .limit(50)
    .lean();
  let count = 0;
  for (const a of recent) {
    if (a.status === "absent") count += 1;
    else break;
  }
  return count;
};
