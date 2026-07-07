import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import User from "../../../models/user.model.js";
import BotUser from "../../../models/botUser.model.js";
import ArchiveReason from "../../../models/archiveReason.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  toUtcMidnight,
  localTodayMidnight,
  scheduleActiveOn,
} from "../../../helpers/attendance.helper.js";
import { restoreGroup as cascadeRestoreGroup } from "../../../helpers/cascadeDelete.helper.js";
import { hardDeleteGroupData } from "../../../helpers/userRelations.helper.js";
import { runFinanceTxn } from "../../finance/services/financeTxn.helper.js";
import logger from "../../../config/logger.js";
import * as financeGroupFeeService from "../../finance/services/groupFee.service.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";
import * as teacherGroupPeriodService from "./teacherGroupPeriod.service.js";
import * as depositService from "../../deposits/services/deposit.service.js";
import * as systemNotificationsService from "../../systemNotifications/services/systemNotifications.service.js";
import { assertPeriodInvariants } from "../../../helpers/period.helper.js";
import { safeRecomputeStudentCompletion } from "../../../helpers/studentCompletion.helper.js";

export const safeUserProjection = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
  role: 1,
  isActive: 1,
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Noto'g'ri identifikator");
  }
  return new mongoose.Types.ObjectId(String(id));
};

// Yozuv amallari uchun: guruh mavjud + aktiv bo'lishi shart. Arxivlangan bo'lsa
// aniq xabar beradi (avval read-only edi - chalg'ituvchi 404). Read yo'llari
// (getById/list/restore) Group.findById ni TO'G'RIDAN-TO'G'RI ishlatadi.
const ensureGroup = async (groupId) => {
  const group = await Group.findById(groupId);
  if (!group || group.isDeleted) throw new ApiError(404, "Guruh topilmadi");
  // Tugagan kurs (isActive=false yoki endDate o'tgan - kunlik job-gacha oyna).
  const ended =
    group.endDate &&
    toUtcMidnight(group.endDate).getTime() <= localTodayMidnight().getTime();
  if (!group.isActive || ended) {
    throw new ApiError(
      400,
      "Kurs tugagan. Davom ettirish uchun tugash sanasini o'zgartiring.",
    );
  }
  return group;
};

const ensureStudent = async (studentId) => {
  const user = await User.findById(studentId);
  if (!user || user.role !== ROLES.STUDENT || !user.isActive || user.isDeleted) {
    throw new ApiError(400, "O'quvchi topilmadi");
  }
  return user;
};

const ensureTeachers = async (teacherIds) => {
  if (!teacherIds || teacherIds.length === 0) return;
  // Guruhda ko'pi bilan bitta o'qituvchi bo'lishi mumkin - o'qituvchi faqat
  // "Almashtirish" orqali o'zgartiriladi, qo'shilmaydi.
  if (teacherIds.length > 1) {
    throw new ApiError(400, "Guruhda faqat bitta o'qituvchi bo'lishi mumkin");
  }
  const ids = teacherIds.map(toObjectId);
  const count = await User.countDocuments({
    _id: { $in: ids },
    role: ROLES.TEACHER,
    isActive: true,
    isDeleted: { $ne: true },
  });
  if (count !== ids.length) {
    throw new ApiError(400, "Bir yoki bir nechta o'qituvchi noto'g'ri");
  }
};

export const list = async ({
  search,
  teacherId,
  archived = false,
  page = 1,
  limit = 20,
}) => {
  const match = { isActive: archived ? false : true, isDeleted: { $ne: true } };
  if (teacherId) match.teachers = toObjectId(teacherId);
  if (search && search.trim()) {
    match.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }

  const skip = (page - 1) * limit;

  // Joriy oy (kartochkada oylik to'lovni ko'rsatish uchun)
  const today = localTodayMidnight();
  const curYear = today.getUTCFullYear();
  const curMonth = today.getUTCMonth() + 1;

  const pipeline = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "groupfees",
        let: { gid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$group", "$$gid"] },
                  { $eq: ["$year", curYear] },
                  { $eq: ["$month", curMonth] },
                ],
              },
            },
          },
          { $project: { amount: 1 } },
        ],
        as: "_fee",
      },
    },
    {
      $addFields: {
        monthlyFee: { $ifNull: [{ $arrayElemAt: ["$_fee.amount", 0] }, null] },
      },
    },
    { $project: { _fee: 0 } },
    {
      $lookup: {
        from: "groupmemberships",
        let: { gid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$group", "$$gid"] },
                  { $eq: ["$leftAt", null] },
                  { $ne: ["$isDeleted", true] },
                ],
              },
            },
          },
          { $count: "n" },
        ],
        as: "_active",
      },
    },
    {
      $addFields: {
        studentsCount: { $ifNull: [{ $arrayElemAt: ["$_active.n", 0] }, 0] },
      },
    },
    { $project: { _active: 0 } },
    {
      $lookup: {
        from: "users",
        let: { tids: "$teachers" },
        pipeline: [
          { $match: { $expr: { $in: ["$_id", "$$tids"] } } },
          { $project: safeUserProjection },
        ],
        as: "teachers",
      },
    },
  ];

  const [items, total] = await Promise.all([
    Group.aggregate(pipeline),
    Group.countDocuments(match),
  ]);

  return { items, total, page, limit };
};

// Berilgan user obyektlariga bog'langan Telegram ma'lumotini (telegramId, username)
// bitta so'rovda biriktiradi. Bog'lanmagan bo'lsa telegram: null bo'ladi.
const attachTelegram = async (userObjs) => {
  const ids = userObjs.map((u) => u?._id).filter(Boolean);
  if (!ids.length) return;
  const bots = await BotUser.find(
    { user: { $in: ids } },
    { user: 1, telegramId: 1, username: 1 },
  ).lean();
  const byUser = new Map(
    bots.map((b) => [
      String(b.user),
      { telegramId: b.telegramId, username: b.username || null },
    ]),
  );
  for (const u of userObjs) {
    u.telegram = byUser.get(String(u._id)) || null;
  }
};

export const getById = async (id) => {
  const group = await Group.findById(id)
    .populate("teachers", safeUserProjection);
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  const memberships = await GroupMembership.find({
    group: group._id,
    leftAt: null,
    isDeleted: { $ne: true },
  })
    .populate("student", safeUserProjection)
    .sort({ joinedAt: 1 });

  const students = memberships
    .filter((m) => m.student)
    .map((m) => ({
      membershipId: m._id,
      joinedAt: m.joinedAt,
      ...m.student.toJSON(),
    }));

  const groupJson = group.toJSON();

  // Telegram ma'lumotini o'quvchilar va o'qituvchilarga biriktiramiz
  await Promise.all([
    attachTelegram(students),
    attachTelegram(groupJson.teachers || []),
  ]);

  return {
    ...groupJson,
    students,
    studentsCount: students.length,
  };
};

// Jadval slotlaridagi effectiveFrom ni UTC-yarim tunga normalizatsiya qiladi
// (yoki null). dropEffective=true bo'lsa - effectiveFrom butunlay null qilinadi
// (yangi guruh: tarix yo'q, hamma slot boshidan amal qiladi).
const normalizeSchedule = (schedule, { dropEffective = false } = {}) =>
  (schedule || []).map((s) => ({
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    effectiveFrom:
      dropEffective || !s.effectiveFrom ? null : toUtcMidnight(s.effectiveFrom),
  }));

// (kun+vaqt) bo'yicha jadval to'plamini taqqoslash uchun kalit (effectiveFrom'siz)
const slotSetKey = (slots) =>
  (slots || [])
    .map((s) => `${s.day}-${s.startTime}-${s.endTime}`)
    .sort()
    .join("|");

// Versiyalash birlashtiruvi: yangi jadval joriy amaldagi versiyaga TENG bo'lsa -
// eski jadvalni o'zgarishsiz qaytaramiz. Farq qilsa - eski (tarixiy) qatorlarni
// saqlab, yangi qatorlarni effectiveFrom (default - bugun) bilan ustiga qo'shamiz.
// Shunday qilib o'tgan sanalar eski versiya, yangi sanalar yangi versiya bo'yicha
// hisoblanadi (BUG-4: tarixiy dars soni shishmaydi).
const mergeScheduleVersion = (existing, incoming, effectiveFromInput) => {
  const incomingClean = normalizeSchedule(incoming, { dropEffective: true });
  const existingArr = existing || [];

  // Joriy (bugun) amaldagi versiya bilan solishtiramiz
  const currentActive = scheduleActiveOn(existingArr);
  if (slotSetKey(currentActive) === slotSetKey(incomingClean)) {
    return existingArr; // o'zgarish yo'q - tarixga tegmaymiz
  }

  const effectiveFrom = effectiveFromInput
    ? toUtcMidnight(effectiveFromInput)
    : localTodayMidnight();
  const effTs = effectiveFrom.getTime();

  // Aynan shu effectiveFrom ga ega eski qatorlarni olib tashlaymiz - bir kunda
  // bir necha marta tahrirlansa yangi versiya eskisini ALMASHTIRADI (dublikat
  // (kun+vaqt+effectiveFrom) bo'lib model rad etmasligi uchun).
  const kept = existingArr.filter((s) => {
    const ts = s.effectiveFrom ? toUtcMidnight(s.effectiveFrom).getTime() : null;
    return ts !== effTs;
  });

  // Eski (tarixiy) qatorlar saqlanadi, yangi versiya effectiveFrom bilan ustiga
  // qo'shiladi. scheduleActiveOn (eng so'nggi effectiveFrom <= sana) tufayli
  // o'tgan sanalar eski, yangi sanalar yangi versiya bo'yicha hisoblanadi.
  const newVersion = incomingClean.map((s) => ({ ...s, effectiveFrom }));
  return [...kept, ...newVersion].map((s) => ({
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    effectiveFrom: s.effectiveFrom ? toUtcMidnight(s.effectiveFrom) : null,
  }));
};

export const create = async (body) => {
  await ensureTeachers(body.teachers);
  const group = await Group.create({
    name: body.name.trim(),
    schedule: normalizeSchedule(body.schedule, { dropEffective: true }),
    // teachers[] - davrlardan HOSILA kesh; assignTeacher syncGroupTeachersCache qiladi.
    teachers: [],
    startDate: body.startDate ? toUtcMidnight(body.startDate) : null,
    endDate: body.endDate ? toUtcMidnight(body.endDate) : null,
    durationMonths: body.durationMonths ?? null,
  });

  const today = localTodayMidnight();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;

  // Guruh yaratilishi bilanoq joriy oy uchun to'lov (GroupFee) yozuvini
  // ta'minlaymiz (best-effort) - aks holda Moliya sahifasida to'lov hali
  // o'quvchi qo'shilmaguncha "Belgilanmagan" bo'lib qolardi. Narx berilgan
  // bo'lsa - o'sha summa bilan (manual), aks holda 0 (auto).
  try {
    if (body.monthlyPrice != null) {
      await financeGroupFeeService.upsert({
        groupId: group._id,
        year,
        month,
        amount: body.monthlyPrice,
      });
    } else {
      await financeGroupFeeService.ensureGroupFee(group._id, year, month);
    }
  } catch (err) {
    logger.warn({ err }, "Yangi guruh uchun oylik to'lov yaratilmadi");
  }

  // O'qituvchilarni dars berish DAVRI sifatida biriktiramiz (manba haqiqati).
  // assignTeacher ochiq davr ochib, teachers[] keshini sinxronlaydi.
  const startDate = group.startDate || today;
  for (const teacherId of body.teachers || []) {
    try {
      await teacherGroupPeriodService.assignTeacher(group._id, teacherId, { startDate });
      await teacherSalaryService.ensureSalaryForTeacherGroup(
        teacherId,
        group._id,
        year,
        month,
      );
    } catch (err) {
      logger.warn({ err }, "Guruh o'qituvchisi biriktirilmadi / maosh yaratilmadi");
    }
  }

  // endDate berilgan bo'lsa hayot-tsiklni moslaymiz (o'tgan sana → darhol arxiv).
  if (group.endDate) {
    await reconcileGroupEnd(await Group.findById(group._id));
  }

  return Group.findById(group._id);
};

export const update = async (id, body) => {
  // Arxivlangan guruhni ham yuklaymiz - endDate'ni tahrirlab REACTIVATE qilish
  // (kelajakka uzaytirish) shu yo'l orqali bo'ladi.
  const group = await Group.findById(id);
  if (!group || group.isDeleted) throw new ApiError(404, "Guruh topilmadi");

  if (body.teachers !== undefined) await ensureTeachers(body.teachers);
  if (body.name !== undefined) group.name = body.name.trim();
  // Versiyalash: client HOZIRGI versiya qatorlarini + bitta "amal qilish sanasi"
  // (scheduleEffectiveFrom) yuboradi. Yangi jadval joriy amaldagi versiyadan farq
  // qilsa - eski versiyalar TARIX uchun saqlanib, yangi qatorlar shu sanadan
  // boshlab amal qiladi. Farq bo'lmasa - hech narsa o'zgartirmaymiz.
  if (body.schedule !== undefined) {
    group.schedule = mergeScheduleVersion(
      group.schedule,
      body.schedule,
      body.scheduleEffectiveFrom,
    );
  }

  if (body.startDate !== undefined) {
    group.startDate = body.startDate ? toUtcMidnight(body.startDate) : null;
  }
  if (body.durationMonths !== undefined) {
    group.durationMonths = body.durationMonths ?? null;
  }
  if (body.endDate !== undefined) {
    const newEnd = body.endDate ? toUtcMidnight(body.endDate) : null;
    if (newEnd && group.startDate && newEnd.getTime() < toUtcMidnight(group.startDate).getTime()) {
      throw new ApiError(400, "Kurs tugash sanasi boshlanish sanasidan oldin bo'lmasin");
    }
    group.endDate = newEnd;
  }

  await group.save();

  // endDate berilgan bo'lsa hayot-tsiklni moslaymiz (arxiv / reactivate +
  // o'qituvchi davri va o'quvchi a'zoliklari avto yopiladi / ochiladi).
  if (body.endDate !== undefined) {
    await reconcileGroupEnd(group);
  }

  // O'qituvchi o'zgarishi - faqat AKTIV guruhda (davrlardan derived maosh).
  // reconcile'dan KEYIN, group.teachers keshi yangilangach hisoblanadi.
  if (body.teachers !== undefined && group.isActive) {
    const fresh = await Group.findById(group._id);
    const oldIds = (fresh.teachers || []).map(String);
    const newIds = (body.teachers || []).map(String);
    const removed = oldIds.filter((t) => !newIds.includes(t));
    const added = newIds.filter((t) => !oldIds.includes(t));
    const today = localTodayMidnight();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    for (const teacherId of removed) {
      try {
        await teacherGroupPeriodService.unassignTeacher(group._id, teacherId, { endDate: today });
      } catch (err) {
        logger.warn({ err }, "Chiqarilgan o'qituvchi davri yopilmadi");
      }
    }
    for (const teacherId of added) {
      try {
        await teacherGroupPeriodService.assignTeacher(group._id, teacherId, { startDate: today });
        await teacherSalaryService.ensureSalaryForTeacherGroup(teacherId, group._id, year, month);
      } catch (err) {
        logger.warn({ err }, "Qo'shilgan o'qituvchi biriktirilmadi / maosh yaratilmadi");
      }
    }
  }

  return Group.findById(group._id);
};

// Guruh tugaganda/arxivlanganda aktiv o'qituvchilarning dars berish davrini yopadi
// (tugash sanasida). endDate EXCLUSIVE → `end` inclusive oxirgi ish kuni bo'lib
// qoladi. Maosh shu oyda davrdan derived proratsiya bilan hisoblanadi. Yopilgan
// davrlarning id'larini qaytaradi (arxivdan chiqarishda aynan shular qayta ochiladi).
const prorateTeachersOnEnd = async (group, end) => {
  const endExclusive = new Date(toUtcMidnight(end).getTime() + 24 * 60 * 60 * 1000);
  const activeIds = await teacherGroupPeriodService.activeTeacherIdsForGroup(group._id, end);
  const closedIds = [];
  for (const teacherId of activeIds) {
    try {
      const closed = await teacherGroupPeriodService.unassignTeacher(
        group._id,
        teacherId,
        { endDate: endExclusive },
      );
      if (closed?._id) closedIds.push(closed._id);
    } catch (err) {
      logger.warn({ err }, "Guruh tugashida o'qituvchi davri yopilmadi");
    }
  }
  return closedIds;
};

// Kurs tugaganda ochiq o'quvchi a'zoliklarini tugash sanasida yopadi (leftAt
// EXCLUSIVE → endExclusive=end+1kun, oxirgi aktiv kun = end). Reactivate uchun
// yopilgan a'zolik id'larini qaytaradi.
const closeMembershipsOnEnd = async (group, end) => {
  const endExclusive = new Date(toUtcMidnight(end).getTime() + 24 * 60 * 60 * 1000);
  const open = await GroupMembership.find(
    { group: group._id, leftAt: null, isDeleted: { $ne: true } },
    { _id: 1, student: 1 },
  ).lean();
  const closedIds = [];
  for (const m of open) {
    try {
      await GroupMembership.updateOne(
        { _id: m._id },
        { $set: { leftAt: endExclusive, leftReason: "graduated" } },
      );
      await recalcFinanceOnLeave(group._id, m.student);
      await safeRecomputeStudentCompletion(m.student);
      closedIds.push(m._id);
    } catch (err) {
      logger.warn({ err }, "Kurs tugashida o'quvchi a'zoligi yopilmadi");
    }
  }
  return closedIds;
};

// Kurs qayta aktivlashganda yopilgan a'zolikni qayta ochadi (leftAt=null), agar
// shu o'quvchi+guruhda boshqa ochiq a'zolik bo'lmasa (single-open invariant).
const reopenMembership = async (membershipId) => {
  const m = await GroupMembership.findById(membershipId);
  if (!m || m.isDeleted || m.leftAt === null) return;
  const openExists = await GroupMembership.findOne({
    group: m.group,
    student: m.student,
    leftAt: null,
    isDeleted: { $ne: true },
  });
  if (openExists) return;
  m.leftAt = null;
  m.leftReason = null;
  m.transferredTo = null;
  await m.save();
  await ensureFinanceForMembershipRange(m.group, m);
  await safeRecomputeStudentCompletion(m.student);
};

// Guruh hayot-tsiklini endDate'ga moslaydi (idempotent). Yagona manba: endDate.
// Avval kurs-tugashi yopgan davr/a'zoliklarni qayta ochadi (endDate o'zgarishi
// uchun toza qayta yopish), so'ng endDate o'tgan bo'lsa o'sha kunda yopadi.
// create/update (endDate o'zgarsa) va kunlik job chaqiradi.
export const reconcileGroupEnd = async (group) => {
  const today = localTodayMidnight();
  const end = group.endDate ? toUtcMidnight(group.endDate) : null;
  const ended = !!end && end.getTime() <= today.getTime();

  const hadClosed =
    (group.archivedClosedPeriods?.length || 0) +
      (group.archivedClosedMemberships?.length || 0) >
    0;
  if (hadClosed) {
    for (const pid of group.archivedClosedPeriods || []) {
      try {
        await teacherGroupPeriodService.reopenPeriod(pid);
      } catch (err) {
        logger.warn({ err }, "Reactivate: o'qituvchi davri qayta ochilmadi");
      }
    }
    for (const mid of group.archivedClosedMemberships || []) {
      try {
        await reopenMembership(mid);
      } catch (err) {
        logger.warn({ err }, "Reactivate: o'quvchi a'zoligi qayta ochilmadi");
      }
    }
    group.archivedClosedPeriods = [];
    group.archivedClosedMemberships = [];
  }

  if (ended) {
    group.archivedClosedPeriods = await prorateTeachersOnEnd(group, end);
    group.archivedClosedMemberships = await closeMembershipsOnEnd(group, end);
    group.isActive = false;
  } else {
    group.isActive = true;
  }
  await group.save();
  return group;
};

// Tugash sanasi YETIB KELGAN, lekin hali aktiv guruhlarni avto arxivlaydi (kunlik
// job + boot catch-up chaqiradi). Idempotent.
export const processDueGroupEnds = async () => {
  const today = localTodayMidnight();
  const due = await Group.find({
    isActive: true,
    isDeleted: { $ne: true },
    endDate: { $ne: null, $lte: today },
  });
  let archived = 0;
  for (const group of due) {
    try {
      await reconcileGroupEnd(group);
      archived += 1;
    } catch (err) {
      logger.warn({ err, group: group._id }, "Guruh avto-arxivlanmadi");
    }
  }
  return { processed: due.length, archived };
};

// Butunlay o'chirish (soft cascade) - FAQAT bo'sh guruh (o'quvchisiz, pulsiz).
// Adashib yaratilgan guruhni tozalash uchun. Tarixi bor guruhni o'chirib bo'lmaydi.
// Guruhni BUTUNLAY (hard) o'chirish - guruh va unga bog'liq BARCHA yozuvlar
// (a'zolik, davomat, baho, to'lov, maosh, narx, dars davri...) fizik o'chadi.
// Tasdiqlash uchun guruh nomini to'g'ri yozish shart (qaytarib bo'lmaydi).
// MOLIYAVIY IZCHILLIK: o'quvchi/o'qituvchi hard-delete kabi, kirim/chiqim yozuvlari
// hisobotlardan toza chiqadi (so'rovda agregatlanadi). YAGONA majburiy tuzatuv -
// depozitdan qoplangan (source:"deposit") to'lovlarni o'quvchi depozitiga qaytarish
// (aks holda garov izsiz yo'qolardi). Boshqa guruhlar/o'qituvchilar moliyasi o'zaro
// bog'liq emas, shu sababli qo'shimcha recalc kerak emas.
export const permanentRemove = async (id, currentUser, { confirmName } = {}) => {
  const group = await Group.findById(id);
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  const name = (group.name || "").trim();
  if (!confirmName || confirmName.trim() !== name) {
    throw new ApiError(400, "Tasdiqlash uchun guruh nomini to'g'ri kiriting");
  }

  const studentIds = await runFinanceTxn(async (session) => {
    // 1) MAJBURIY: depozitdan qoplangan to'lovlarni o'quvchi depozitiga QAYTARAMIZ.
    const covers = await PaymentTransaction.find(
      { group: toObjectId(id), source: "deposit", isDeleted: { $ne: true } },
      { student: 1, amount: 1 },
    ).session(session || null);
    const perStudent = new Map();
    for (const c of covers) {
      if (!c.student) continue;
      const key = String(c.student);
      perStudent.set(key, (perStudent.get(key) || 0) + (c.amount || 0));
    }
    for (const [sid, total] of perStudent) {
      if (total > 0) {
        await depositService.refundToDeposit(sid, total, {
          session,
          note: "Guruh o'chirildi - depozitga qaytarildi",
        });
      }
    }

    // 2) Guruhga oid BARCHA yozuvlarni fizik o'chiramiz + guruhning o'zini.
    const sids = await hardDeleteGroupData(id, { session });
    await Group.deleteOne({ _id: id }, session ? { session } : undefined);
    return sids;
  });

  // A'zolik o'chgani uchun o'quvchilar yakunlash sanasini qayta hisoblaymiz (best-effort).
  for (const sid of studentIds) {
    await safeRecomputeStudentCompletion(sid);
  }

  // Owner uchun tizim bildirishnomasi (best-effort).
  try {
    await systemNotificationsService.create({
      message: `${name} guruhi tizimdan butunlay o'chirildi`,
    });
  } catch {
    // bildirishnoma yozilmasa ham o'chirish buzilmasin
  }

  return { _id: id };
};

// O'chirilgan guruhni qaytarish
export const restoreDeleted = async (id) => {
  const group = await Group.findById(id);
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  await cascadeRestoreGroup(id);
  return Group.findById(id);
};

// Membershipning joinedAt oyidan tugash oyigacha (leftAt yoki bugun) har bir oy
// uchun GroupFee (backfill) + proratsiyalangan to'lov + o'qituvchi maoshini
// yaratadi/yangilaydi (best-effort). Eski o'quvchi joinedAt o'tgan oyga qo'yilsa,
// o'tgan oylar qarzi ham proratsiyalangan holda chiqadi.
const ensureFinanceForMembershipRange = async (groupId, membership) => {
  try {
    const today = localTodayMidnight();
    // Tugash chegarasi: leftAt bo'lsa o'sha oy, aks holda joriy oy.
    const endRef = membership.leftAt
      ? toUtcMidnight(membership.leftAt)
      : today;
    const endYear = endRef.getUTCFullYear();
    const endMonth = endRef.getUTCMonth() + 1; // 1-12

    const join = membership.joinedAt;
    let year = join.getUTCFullYear();
    let month = join.getUTCMonth() + 1; // 1-12

    while (year < endYear || (year === endYear && month <= endMonth)) {
      await financeGroupFeeService.ensureGroupFeeBackfill(groupId, year, month);
      await financePaymentService.ensurePaymentForMembership(membership, year, month);
      await teacherSalaryService.recalcForGroupMonth(groupId, year, month);

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  } catch (err) {
    logger.warn({ err }, "A'zolik uchun oylik to'lovlar yaratilmadi");
  }
};

export const addStudent = async (
  groupId,
  studentId,
  { joinedAt, leftAt } = {},
) => {
  const group = await ensureGroup(groupId);
  await ensureStudent(studentId);

  const existing = await GroupMembership.findOne({
    group: groupId,
    student: studentId,
    leftAt: null,
    isDeleted: { $ne: true },
  });
  if (existing) {
    throw new ApiError(409, "O'quvchi allaqachon shu guruhda");
  }

  // Boshlash sanasi - berilsa o'sha kun, aks holda guruh BOSHLANGAN sana (default):
  // startDate (Dars boshlanish sanasi), u yo'q bo'lsa guruh yaratilgan sanasi.
  // MUHIM: davomat ham mahalliy "bugun" bilan ishlaydi - UTC ishlatilsa, yarim
  // tundan keyin (mahalliy 00:00–05:00) joinedAt ertangi/kechagi kunga tushib,
  // bugungi davomatda o'quvchi ko'rinmay qolardi.
  const defaultJoin = group.startDate || group.createdAt;
  const join = joinedAt ? toUtcMidnight(joinedAt) : toUtcMidnight(defaultJoin);
  const left = leftAt ? toUtcMidnight(leftAt) : null;
  if (left && left.getTime() < join.getTime()) {
    throw new ApiError(400, "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas");
  }

  // A'zolik davrlari kesishmasligi + bitta ochiq (tugamagan) bo'lishi shart.
  const otherMems = await GroupMembership.find(
    { group: groupId, student: studentId, isDeleted: { $ne: true } },
    { joinedAt: 1, leftAt: 1 },
  ).lean();
  assertPeriodInvariants(
    { startDate: join, endDate: left },
    otherMems.map((m) => ({ startDate: m.joinedAt, endDate: m.leftAt })),
    "date",
  );

  const membership = await GroupMembership.create({
    group: groupId,
    student: studentId,
    joinedAt: join,
    leftAt: left,
  });

  // joinedAt oyidan tugash oyigacha barcha oylar uchun qarz yoziladi.
  await ensureFinanceForMembershipRange(groupId, membership);

  await safeRecomputeStudentCompletion(studentId);

  return membership;
};

// O'quvchining guruhdagi FAOL a'zoligi sanalarini (joinedAt/leftAt) tahrirlaydi.
// Qulf: joinedAt'ni OLDINGA (kechroq sanaga) surishda, oradagi davrda biror oy
// to'langan bo'lsa (paidAmount > 0) - rad etiladi. Ya'ni qarz yozilib to'langach,
// "men keyinroq qo'shilganman" deb o'sha to'langan oyni o'chirib bo'lmaydi.
// Bitta a'zolik davri (GroupMembership) sanalarini o'zgartirish + moliya kaskadi.
// Faol davr ham, tarixiy davr ham (id bo'yicha) shu yadrodan o'tadi.
const applyMembershipDates = async (membership, { joinedAt, leftAt } = {}) => {
  const groupId = membership.group;
  const studentId = membership.student;

  const oldJoin = toUtcMidnight(membership.joinedAt);
  const newJoin =
    joinedAt !== undefined && joinedAt !== null
      ? toUtcMidnight(joinedAt)
      : oldJoin;
  // leftAt: undefined → o'zgartirmaymiz; null → "o'qimoqda"ga qaytaramiz.
  const newLeft =
    leftAt === undefined
      ? membership.leftAt
        ? toUtcMidnight(membership.leftAt)
        : null
      : leftAt
      ? toUtcMidnight(leftAt)
      : null;

  if (newLeft && newLeft.getTime() < newJoin.getTime()) {
    throw new ApiError(400, "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas");
  }

  // Qulf: joinedAt oldinga surilyaptimi (yangi sana eskidan kech)?
  if (newJoin.getTime() > oldJoin.getTime()) {
    // Yangi joinedAt oyidan OLDIN to'langan oy bormi?
    const paid = await financePaymentService.earliestPaidMonthBefore(
      studentId,
      groupId,
      { year: newJoin.getUTCFullYear(), month: newJoin.getUTCMonth() + 1 },
    );
    if (paid) {
      throw new ApiError(
        409,
        `To'langan davrni o'zgartirib bo'lmaydi: ${paid.year}-yil ${paid.month}-oy uchun to'lov qilingan`,
      );
    }
  }

  // Yangi sanalar boshqa a'zolik davrlari bilan kesishmasligini tekshiramiz.
  const otherMems = await GroupMembership.find(
    { group: groupId, student: studentId, _id: { $ne: membership._id }, isDeleted: { $ne: true } },
    { joinedAt: 1, leftAt: 1 },
  ).lean();
  assertPeriodInvariants(
    { startDate: newJoin, endDate: newLeft },
    otherMems.map((m) => ({ startDate: m.joinedAt, endDate: m.leftAt })),
    "date",
  );

  membership.joinedAt = newJoin;
  membership.leftAt = newLeft;
  await membership.save();

  // Eski davrda bo'lib, yangi davrga TUSHMAY qolgan oylarni 0 ga tushirish va
  // yangi davr oylarini yaratish uchun shu o'quvchi-guruhning BARCHA to'lovlarini
  // qayta hisoblaymiz, so'ng yangi davr oylari uchun yozuvlar ta'minlanadi.
  try {
    await financePaymentService.recalcForStudentScope(studentId, groupId, {});
  } catch (err) {
    logger.warn({ err }, "A'zolik tahrirlanganda eski to'lovlar qayta hisoblanmadi");
  }
  await ensureFinanceForMembershipRange(groupId, membership);

  await safeRecomputeStudentCompletion(studentId);

  return membership;
};

export const updateMembership = async (
  groupId,
  studentId,
  { joinedAt, leftAt } = {},
) => {
  await ensureGroup(groupId);
  await ensureStudent(studentId);

  const membership = await GroupMembership.findOne({
    group: groupId,
    student: studentId,
    leftAt: null,
    isDeleted: { $ne: true },
  });
  if (!membership) {
    throw new ApiError(404, "O'quvchining ushbu guruhda faol a'zoligi topilmadi");
  }
  return applyMembershipDates(membership, { joinedAt, leftAt });
};

// O'quvchining guruhdagi BARCHA o'qish davrlari (yopiq + ochiq), eng yangisi yuqorida.
export const listMemberships = async (groupId, studentId) =>
  GroupMembership.find({
    group: groupId,
    student: studentId,
    isDeleted: { $ne: true },
  })
    .sort({ joinedAt: -1 })
    .lean();

// O'qish davrini ID bo'yicha tahrirlash (tarixiy davr ham) - "O'qish davrlari" UI.
export const updateMembershipById = async (
  groupId,
  membershipId,
  { joinedAt, leftAt } = {},
) => {
  await ensureGroup(groupId);
  const membership = await GroupMembership.findOne({
    _id: membershipId,
    group: groupId,
    isDeleted: { $ne: true },
  });
  if (!membership) throw new ApiError(404, "O'qish davri topilmadi");
  return applyMembershipDates(membership, { joinedAt, leftAt });
};

// O'qish davri qamragan oylar (year/month), oxiri joriy oygacha. leftAt EXCLUSIVE.
const membershipMonths = (joinedAt, leftAt) => {
  const DAY = 24 * 60 * 60 * 1000;
  const today = localTodayMidnight();
  const curIdx = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const s = new Date(joinedAt);
  const startIdx = s.getUTCFullYear() * 12 + s.getUTCMonth();
  let endIdx = curIdx;
  if (leftAt) {
    const e = new Date(new Date(leftAt).getTime() - DAY);
    endIdx = e.getUTCFullYear() * 12 + e.getUTCMonth();
  }
  endIdx = Math.min(endIdx, curIdx);
  const out = [];
  for (let i = startIdx; i <= endIdx; i += 1) {
    out.push({ year: Math.floor(i / 12), month: (i % 12) + 1 });
  }
  return out;
};

// O'qish davrini o'chirish - to'lov qo'riqlovchisi bilan (o'qituvchi davri patterni).
export const removeMembershipById = async (groupId, membershipId) => {
  await ensureGroup(groupId);
  const membership = await GroupMembership.findOne({
    _id: membershipId,
    group: groupId,
    isDeleted: { $ne: true },
  });
  if (!membership) throw new ApiError(404, "O'qish davri topilmadi");

  const months = membershipMonths(membership.joinedAt, membership.leftAt);
  if (months.length) {
    const paid = await StudentPayment.findOne({
      student: membership.student,
      group: groupId,
      paidAmount: { $gt: 0 },
      $or: months,
    });
    if (paid) {
      throw new ApiError(
        400,
        "Bu davrga oid to'lov mavjud. Avval to'lovlarni o'chiring.",
      );
    }
  }

  await membership.softDelete();
  try {
    await financePaymentService.recalcForStudentScope(membership.student, groupId, {});
  } catch (err) {
    logger.warn({ err }, "O'qish davri o'chirilganda to'lovlar qayta hisoblanmadi");
  }
  await safeRecomputeStudentCompletion(membership.student);
  return { _id: membership._id };
};

// A'zolik yopilganda (chiqarish/ko'chirish) o'quvchining shu guruhdagi BARCHA oylik
// to'lovlarini (avans bilan yaratilgan kelgusi oylar ham) leftAt bo'yicha qayta
// proratsiya qiladi, so'ng o'qituvchi foiz maoshini yangilaydi (best-effort).
const recalcFinanceOnLeave = async (groupId, studentId) => {
  try {
    await financePaymentService.recalcForStudentScope(studentId, groupId, {});
    const today = localTodayMidnight();
    await teacherSalaryService.recalcForGroupMonth(
      groupId,
      today.getUTCFullYear(),
      today.getUTCMonth() + 1,
    );
  } catch (err) {
    logger.warn({ err }, "A'zolik yopilganda to'lovlar qayta hisoblanmadi");
  }
};

export const removeStudent = async (groupId, studentId, { reasonId } = {}) => {
  await ensureGroup(groupId);
  const leftAt = toUtcMidnight(new Date());

  // Dinamik chiqish sababi (ixtiyoriy) - snapshot title bilan birga yozamiz,
  // shunda sabab keyin o'chsa/o'zgarsa ham retention hisoboti buzilmaydi.
  const set = { leftAt, leftReason: "removed" };
  if (reasonId) {
    const reason = await ArchiveReason.findById(reasonId, { title: 1 }).lean();
    if (!reason) throw new ApiError(400, "Chiqish sababi topilmadi");
    set.leftReasonDetail = reason._id;
    set.leftReasonTitle = reason.title;
  }

  const membership = await GroupMembership.findOneAndUpdate(
    { group: groupId, student: studentId, leftAt: null, isDeleted: { $ne: true } },
    { $set: set },
    { new: true },
  );
  if (!membership) {
    throw new ApiError(404, "Faol a'zolik topilmadi");
  }

  // Ketgan o'quvchi endi to'liq oy uchun hisoblanmasin (C1 tuzatish)
  await recalcFinanceOnLeave(groupId, studentId);

  await safeRecomputeStudentCompletion(studentId);

  return membership;
};

export const history = async (groupId, { page = 1, limit = 20 } = {}) => {
  await ensureGroup(groupId);
  const filter = { group: groupId };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    GroupMembership.find(filter)
      .sort({ joinedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("student", safeUserProjection)
      .populate("transferredTo", { name: 1 }),
    GroupMembership.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export const listForTeacher = async (teacherId) => {
  const { items } = await list({ teacherId, limit: 100, page: 1 });
  return items;
};

export const findActiveForStudent = async (studentId) => {
  const membership = await GroupMembership.findOne({
    student: studentId,
    leftAt: null,
    isDeleted: { $ne: true },
  })
    .populate({
      path: "group",
      populate: { path: "teachers", select: safeUserProjection },
    })
    .sort({ joinedAt: -1 });

  if (!membership || !membership.group) return null;
  return {
    joinedAt: membership.joinedAt,
    group: membership.group,
  };
};

// O'quvchining BARCHA active a'zoliklari (multi-active)
export const findAllActiveForStudent = async (studentId) => {
  const memberships = await GroupMembership.find({
    student: studentId,
    leftAt: null,
    isDeleted: { $ne: true },
  })
    .populate({
      path: "group",
      populate: { path: "teachers", select: safeUserProjection },
    })
    .sort({ joinedAt: 1 });

  return memberships
    .filter((m) => m.group)
    .map((m) => ({
      membershipId: m._id,
      joinedAt: m.joinedAt,
      group: m.group,
    }));
};

// Guruhdan chiqarilgan o'quvchiga login qilganda bir marta ko'rsatiladigan
// xabar. Eng oxirgi "removed" a'zolikni qaytaradi, agar:
//  • hali ko'rilmagan bo'lsa (removalNoticeSeenAt = null), va
//  • o'quvchi o'sha guruhga hozir qayta a'zo bo'lmagan bo'lsa (qayta qo'shilgan
//    bo'lsa xabar ortiqcha).
// Bittadan ortiq bo'lsa - eng so'nggisi (leftAt bo'yicha) ko'rsatiladi.
export const findPendingRemovalNotice = async (studentId) => {
  const membership = await GroupMembership.findOne({
    student: studentId,
    leftReason: "removed",
    leftAt: { $ne: null },
    removalNoticeSeenAt: null,
    isDeleted: { $ne: true },
  })
    .populate({ path: "group", select: "name" })
    .sort({ leftAt: -1 });

  if (!membership || !membership.group) return null;

  // O'quvchi o'sha guruhga qayta faol a'zo bo'lganmi? Bo'lsa - xabar bermaymiz
  // (ammo seen ham qilmaymiz, chunki bu boshqa a'zolik yozuvi).
  const rejoined = await GroupMembership.exists({
    student: studentId,
    group: membership.group._id,
    leftAt: null,
    isDeleted: { $ne: true },
  });
  if (rejoined) return null;

  return {
    membershipId: String(membership._id),
    groupName: membership.group.name,
    reasonTitle: membership.leftReasonTitle || "",
    leftAt: membership.leftAt,
  };
};

// Xabar ko'rilgan deb belgilaydi (modal yopilganda chaqiriladi). Faqat shu
// o'quvchining ko'rilmagan "removed" a'zoliklarini yopadi - shunda qayta
// login qilinganda modal chiqmaydi.
export const markRemovalNoticesSeen = async (studentId) => {
  await GroupMembership.updateMany(
    {
      student: studentId,
      leftReason: "removed",
      removalNoticeSeenAt: null,
    },
    { $set: { removalNoticeSeenAt: new Date() } },
  );
};
