import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import User from "../../../models/user.model.js";
import LeadDirection from "../../../models/leadDirection.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { toUtcMidnight } from "../../../helpers/attendance.helper.js";
import { reconcileOnLeave } from "../../invoices/services/invoices.service.js";
import {
  deleteGroup as cascadeDeleteGroup,
  restoreGroup as cascadeRestoreGroup,
} from "../../../helpers/cascadeDelete.helper.js";

export const safeUserProjection = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
  role: 1,
  isActive: 1,
  balance: 1,
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

const ensureDirection = async (directionId) => {
  if (directionId === null || directionId === undefined) return;
  const exists = await LeadDirection.exists({ _id: toObjectId(directionId) });
  if (!exists) throw new ApiError(400, "Yo'nalish topilmadi");
};

const ensureTeachers = async (teacherIds) => {
  if (!teacherIds || teacherIds.length === 0) return;
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
    {
      $lookup: {
        from: LeadDirection.collection.name,
        localField: "direction",
        foreignField: "_id",
        as: "direction",
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    {
      $addFields: {
        direction: { $arrayElemAt: ["$direction", 0] },
      },
    },
  ];

  const [items, total] = await Promise.all([
    Group.aggregate(pipeline),
    Group.countDocuments(match),
  ]);

  return { items, total, page, limit };
};

export const getById = async (id) => {
  const group = await Group.findById(id)
    .populate("teachers", safeUserProjection)
    .populate("direction", { name: 1 });
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

  return {
    ...group.toJSON(),
    students,
    studentsCount: students.length,
  };
};

export const create = async (body) => {
  await ensureTeachers(body.teachers);
  if (body.direction) await ensureDirection(body.direction);
  return Group.create({
    name: body.name.trim(),
    schedule: body.schedule || [],
    teachers: body.teachers || [],
    monthlyPrice: body.monthlyPrice ?? 0,
    direction: body.direction || null,
    startDate: body.startDate ? toUtcMidnight(body.startDate) : null,
    durationMonths: body.durationMonths ?? null,
    teacherAbsenceMode: body.teacherAbsenceMode ?? "inherit",
    teacherAbsenceAmount: body.teacherAbsenceAmount ?? 0,
  });
};

export const update = async (id, body) => {
  const group = await ensureGroup(id);

  if (body.teachers !== undefined) {
    await ensureTeachers(body.teachers);
    group.teachers = body.teachers;
  }
  if (body.direction !== undefined) {
    if (body.direction) await ensureDirection(body.direction);
    group.direction = body.direction || null;
  }
  if (body.name !== undefined) group.name = body.name.trim();
  if (body.schedule !== undefined) group.schedule = body.schedule;
  if (body.monthlyPrice !== undefined) group.monthlyPrice = body.monthlyPrice;
  if (body.startDate !== undefined) {
    group.startDate = body.startDate ? toUtcMidnight(body.startDate) : null;
  }
  if (body.durationMonths !== undefined) {
    group.durationMonths = body.durationMonths ?? null;
  }
  if (body.teacherAbsenceMode !== undefined) {
    group.teacherAbsenceMode = body.teacherAbsenceMode;
  }
  if (body.teacherAbsenceAmount !== undefined) {
    group.teacherAbsenceAmount = body.teacherAbsenceAmount;
  }

  await group.save();
  return group;
};

// Guruh tugatilganda/arxivlanganda — har bir faol o'quvchining joriy oy hisobini
// o'qigan qismiga (prorate) moslaydi. A'zoliklar yopilmaydi (tiklash toza bo'lsin).
const reconcileGroupInvoices = async (group, endDate) => {
  const period = { year: endDate.getUTCFullYear(), month: endDate.getUTCMonth() + 1 };
  const memberships = await GroupMembership.find({ group: group._id, leftAt: null });
  for (const m of memberships) {
    await reconcileOnLeave(m.student, group, m._id, period, endDate, {});
  }
};

export const remove = async (id) => {
  const group = await ensureGroup(id);
  group.isActive = false;
  // Arxivlangach to'lov/maosh to'xtashi uchun tugash sanasini belgilaymiz
  if (!group.finishedAt) group.finishedAt = toUtcMidnight(new Date());
  await group.save();
  await reconcileGroupInvoices(group, group.finishedAt);
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

// Butunlay o'chirish (soft) — guruh + a'zolik/hisob/to'lov/davomat/stavka isDeleted=true
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

// Kursni yakunlash — status=finished + finishedAt; joriy oy hisoblari o'qigan qismiga prorate qilinadi.
export const finish = async (id, { finishedAt } = {}) => {
  const group = await ensureGroup(id);
  const end = toUtcMidnight(finishedAt || new Date());
  group.status = "finished";
  group.finishedAt = end;
  await group.save();
  await reconcileGroupInvoices(group, end);
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
  });
  if (existing) {
    throw new ApiError(409, "O'quvchi allaqachon shu guruhda");
  }

  // Boshlash sanasi — default bugun, UTC midnight'ga normallashtirilgan
  const membership = await GroupMembership.create({
    group: groupId,
    student: studentId,
    joinedAt: toUtcMidnight(joinedAt || new Date()),
  });

  // O'quvchi yana o'qishni boshladi — "chiqib ketgan" holatini tozalaymiz
  await User.findByIdAndUpdate(studentId, { leaveStatus: null });

  return membership;
};

export const removeStudent = async (groupId, studentId, leaveStatus) => {
  const leftAt = toUtcMidnight(new Date());
  const membership = await GroupMembership.findOneAndUpdate(
    { group: groupId, student: studentId, leftAt: null, isDeleted: { $ne: true } },
    { $set: { leftAt, leftReason: "removed" } },
    { new: true },
  );
  if (!membership) {
    throw new ApiError(404, "Faol a'zolik topilmadi");
  }

  // O'qigan qismi uchun joriy oy hisobini prorate qilamiz (arxiv/yakunlash bilan bir xil)
  const group = await Group.findById(groupId);
  if (group) {
    const period = { year: leftAt.getUTCFullYear(), month: leftAt.getUTCMonth() + 1 };
    await reconcileOnLeave(studentId, group, membership._id, period, leftAt, {});
  }

  // Oxirgi guruhdan chiqdimi? — chiqib ketish holatini belgilaymiz
  const stillActive = await GroupMembership.exists({
    student: studentId,
    leftAt: null,
  });
  if (!stillActive && (leaveStatus === "left_unpaid" || leaveStatus === "left_paid")) {
    await User.findByIdAndUpdate(studentId, { leaveStatus });
  }

  return membership;
};

const transferSequential = async (groupId, studentId, targetGroupId) => {
  const closed = await GroupMembership.findOneAndUpdate(
    { group: groupId, student: studentId, leftAt: null },
    {
      $set: {
        leftAt: new Date(),
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
      joinedAt: toUtcMidnight(new Date()),
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

export const transferStudent = async (groupId, studentId, targetGroupId) => {
  if (String(groupId) === String(targetGroupId)) {
    throw new ApiError(400, "Bir xil guruhga ko'chirib bo'lmaydi");
  }

  await ensureGroup(groupId);
  await ensureGroup(targetGroupId);
  await ensureStudent(studentId);

  // Mongo replica set bo'lsa transaction; aks holda sequential fallback
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const closed = await GroupMembership.findOneAndUpdate(
      { group: groupId, student: studentId, leftAt: null },
      {
        $set: {
          leftAt: new Date(),
          leftReason: "transferred",
          transferredTo: targetGroupId,
        },
      },
      { new: true, session },
    );
    if (!closed) throw new ApiError(404, "Faol a'zolik topilmadi");

    const [opened] = await GroupMembership.create(
      [{ group: targetGroupId, student: studentId, joinedAt: toUtcMidnight(new Date()) }],
      { session },
    );
    await session.commitTransaction();
    session.endSession();
    return { closed, opened };
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
    return transferSequential(groupId, studentId, targetGroupId);
  }
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
