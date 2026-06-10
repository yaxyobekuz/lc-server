import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
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
import {
  deleteGroup as cascadeDeleteGroup,
  restoreGroup as cascadeRestoreGroup,
} from "../../../helpers/cascadeDelete.helper.js";
import logger from "../../../config/logger.js";
import * as financeGroupFeeService from "../../finance/services/groupFee.service.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";

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

const ensureGroup = async (groupId) => {
  const group = await Group.findById(groupId);
  if (!group || !group.isActive || group.isDeleted) {
    throw new ApiError(404, "Guruh topilmadi");
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

  const pipeline = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
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
    teachers: body.teachers || [],
    startDate: body.startDate ? toUtcMidnight(body.startDate) : null,
    durationMonths: body.durationMonths ?? null,
  });

  // O'qituvchi biriktirilgan bo'lsa joriy oy maoshini yaratamiz (best-effort)
  const teacherId = (group.teachers || [])[0];
  if (teacherId) {
    try {
      const today = localTodayMidnight();
      await teacherSalaryService.ensureSalaryForTeacherGroup(
        teacherId,
        group._id,
        today.getUTCFullYear(),
        today.getUTCMonth() + 1,
      );
    } catch (err) {
      logger.warn({ err }, "Guruh o'qituvchisi uchun maosh yaratilmadi");
    }
  }

  return group;
};

export const update = async (id, body) => {
  const group = await ensureGroup(id);

  if (body.teachers !== undefined) {
    await ensureTeachers(body.teachers);
    group.teachers = body.teachers;
  }
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

  await group.save();
  return group;
};

export const remove = async (id) => {
  const group = await ensureGroup(id);
  group.isActive = false;
  // Arxivlangach davomat to'xtashi uchun tugash sanasini belgilaymiz
  if (!group.finishedAt) group.finishedAt = toUtcMidnight(new Date());
  await group.save();
  return group;
};

export const restore = async (id) => {
  const group = await Group.findById(id);
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  group.isActive = true;
  group.status = "active";
  group.finishedAt = null;
  await group.save();
  return group;
};

// Butunlay o'chirish (soft) - guruh + a'zolik/davomat isDeleted=true
export const permanentRemove = async (id, currentUser) => {
  const group = await Group.findById(id);
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  await cascadeDeleteGroup(id, currentUser?._id);
  return { _id: id };
};

// O'chirilgan guruhni qaytarish
export const restoreDeleted = async (id) => {
  const group = await Group.findById(id);
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  await cascadeRestoreGroup(id);
  return Group.findById(id);
};

// Kursni yakunlash - status=finished + finishedAt (undan keyin davomat to'xtaydi).
export const finish = async (id, { finishedAt } = {}) => {
  const group = await ensureGroup(id);
  const end = toUtcMidnight(finishedAt || new Date());
  group.status = "finished";
  group.finishedAt = end;
  await group.save();
  return group;
};

export const addStudent = async (groupId, studentId, { joinedAt } = {}) => {
  const group = await ensureGroup(groupId);
  if (group.status === "finished") {
    throw new ApiError(400, "Yakunlangan guruhga o'quvchi qo'shib bo'lmaydi");
  }
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

  // Boshlash sanasi - berilsa o'sha kun, aks holda mahalliy (Asia/Tashkent) "bugun".
  // MUHIM: davomat ham mahalliy "bugun" bilan ishlaydi - UTC ishlatilsa, yarim
  // tundan keyin (mahalliy 00:00–05:00) joinedAt ertangi/kechagi kunga tushib,
  // bugungi davomatda o'quvchi ko'rinmay qolardi.
  const membership = await GroupMembership.create({
    group: groupId,
    student: studentId,
    joinedAt: joinedAt ? toUtcMidnight(joinedAt) : localTodayMidnight(),
  });

  // O'quvchi qo'shilishi bilanoq joriy oy to'lovini yaratamiz (best-effort)
  try {
    const today = localTodayMidnight();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    await financeGroupFeeService.ensureGroupFee(groupId, year, month);
    await financePaymentService.ensurePaymentForMembership(membership, year, month);
    // Yangi o'quvchi guruh billed tushumini oshiradi → o'qituvchi foiz maoshi
    await teacherSalaryService.recalcForGroupMonth(groupId, year, month);
  } catch (err) {
    logger.warn({ err }, "Yangi o'quvchi uchun oylik to'lov yaratilmadi");
  }

  return membership;
};

export const removeStudent = async (groupId, studentId, { reasonId } = {}) => {
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

  return membership;
};

const transferSequential = async (groupId, studentId, targetGroupId, joinDate) => {
  const closed = await GroupMembership.findOneAndUpdate(
    { group: groupId, student: studentId, leftAt: null, isDeleted: { $ne: true } },
    {
      $set: {
        // leftAt = chiqilgan kun yarim tuni (exclusive: shu kun endi a'zolik emas).
        // removeStudent bilan bir xil encoding - davomat hisobi izchil bo'lsin.
        leftAt: localTodayMidnight(),
        leftReason: "transferred",
        transferredTo: targetGroupId,
      },
    },
    { new: true },
  );
  if (!closed) throw new ApiError(404, "Faol a'zolik topilmadi");

  try {
    const opened = await GroupMembership.create({
      group: targetGroupId,
      student: studentId,
      joinedAt: joinDate,
    });
    return { closed, opened };
  } catch (err) {
    // rollback (sequential mode)
    await GroupMembership.updateOne(
      { _id: closed._id },
      { $set: { leftAt: null, leftReason: null, transferredTo: null } },
    );
    throw err;
  }
};

// Yangi guruh uchun joriy oy moliya to'lovini yaratadi (best-effort) - addStudent kabi.
const ensureFinanceForMembership = async (groupId, membership) => {
  try {
    const today = localTodayMidnight();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    await financeGroupFeeService.ensureGroupFee(groupId, year, month);
    await financePaymentService.ensurePaymentForMembership(membership, year, month);
    await teacherSalaryService.recalcForGroupMonth(groupId, year, month);
  } catch (err) {
    logger.warn({ err }, "Ko'chirilgan o'quvchi uchun moliya to'lovi yaratilmadi");
  }
};

export const transferStudent = async (groupId, studentId, targetGroupId, { joinedAt } = {}) => {
  if (String(groupId) === String(targetGroupId)) {
    throw new ApiError(400, "Bir xil guruhga ko'chirib bo'lmaydi");
  }

  await ensureGroup(groupId);
  await ensureGroup(targetGroupId);
  await ensureStudent(studentId);

  // Yangi guruhga qo'shilish sanasi - berilsa o'sha kun, aks holda mahalliy "bugun"
  const joinDate = joinedAt ? toUtcMidnight(joinedAt) : localTodayMidnight();

  // Mongo replica set bo'lsa transaction; aks holda sequential fallback
  let result;
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const closed = await GroupMembership.findOneAndUpdate(
      { group: groupId, student: studentId, leftAt: null, isDeleted: { $ne: true } },
      {
        $set: {
          // leftAt = chiqilgan kun yarim tuni (exclusive) - removeStudent bilan bir xil
          leftAt: localTodayMidnight(),
          leftReason: "transferred",
          transferredTo: targetGroupId,
        },
      },
      { new: true, session },
    );
    if (!closed) throw new ApiError(404, "Faol a'zolik topilmadi");

    const [opened] = await GroupMembership.create(
      [{ group: targetGroupId, student: studentId, joinedAt: joinDate }],
      { session },
    );
    await session.commitTransaction();
    session.endSession();
    result = { closed, opened };
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        /* noop */
      }
      session.endSession();
    }
    if (err instanceof ApiError) throw err;
    // Standalone Mongo (no transaction support) - fallback
    result = await transferSequential(groupId, studentId, targetGroupId, joinDate);
  }

  // Yangi guruh uchun joriy oy to'lovini darhol yaratamiz
  await ensureFinanceForMembership(targetGroupId, result.opened);
  return result;
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
