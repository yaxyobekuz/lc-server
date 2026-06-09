import TeacherGroupRate from "../../../models/teacherGroupRate.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";

const TEACHER_PROJECTION = { firstName: 1, lastName: 1, username: 1, phone: 1 };
const GROUP_PROJECTION = { name: 1, monthlyPrice: 1, isActive: 1 };

const ensureTeacher = async (teacherId) => {
  const u = await User.findById(teacherId);
  if (!u || u.role !== ROLES.TEACHER) {
    throw new ApiError(400, "O'qituvchi topilmadi");
  }
  return u;
};

const ensureGroup = async (groupId) => {
  const g = await Group.findById(groupId);
  if (!g) throw new ApiError(400, "Guruh topilmadi");
  return g;
};

export const list = async ({
  teacherId,
  groupId,
  isActive,
  page = 1,
  limit = 50,
}) => {
  const filter = { isDeleted: { $ne: true } };
  if (teacherId) filter.teacher = teacherId;
  if (groupId) filter.group = groupId;
  if (isActive !== undefined) filter.isActive = !!isActive;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TeacherGroupRate.find(filter)
      .sort({ isActive: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("teacher", TEACHER_PROJECTION)
      .populate("group", GROUP_PROJECTION),
    TeacherGroupRate.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await TeacherGroupRate.findById(id)
    .populate("teacher", TEACHER_PROJECTION)
    .populate("group", GROUP_PROJECTION);
  if (!doc) throw new ApiError(404, "Stavka topilmadi");
  return doc;
};

export const findActiveForTeacherGroup = async (teacherId, groupId) => {
  return TeacherGroupRate.findOne({
    teacher: teacherId,
    group: groupId,
    isActive: true,
  });
};

const buildPayload = (body) => ({
  teacher: body.teacher,
  group: body.group,
  calculationType: body.calculationType,
  fixedAmount: Number(body.fixedAmount || 0),
  hourlyRate: Number(body.hourlyRate || 0),
  hoursPerSession:
    body.hoursPerSession !== undefined ? Number(body.hoursPerSession) : 2,
  percentageRate: Number(body.percentageRate || 0),
  amountPerStudent: Number(body.amountPerStudent || 0),
  minMonthlyAmount: Number(body.minMonthlyAmount || 0),
  notes: body.notes || "",
});

export const create = async (body, currentUser) => {
  await ensureTeacher(body.teacher);
  const group = await ensureGroup(body.group);

  // Stavka faqat o'qituvchi biriktirilgan guruh uchun ochilishi mumkin
  const teachesGroup = (group.teachers || []).some(
    (t) => String(t) === String(body.teacher),
  );
  if (!teachesGroup) {
    throw new ApiError(400, "Bu guruh o'qituvchiga biriktirilmagan");
  }

  const existing = await TeacherGroupRate.findOne({
    teacher: body.teacher,
    group: body.group,
    isActive: true,
  });
  if (existing) {
    throw new ApiError(409, "Bu o'qituvchi-guruh uchun faol stavka mavjud");
  }

  return TeacherGroupRate.create({
    ...buildPayload(body),
    isActive: true,
    effectiveFrom: body.effectiveFrom
      ? new Date(body.effectiveFrom)
      : new Date(),
    createdBy: currentUser?._id || null,
  });
};

// Soft tahrirlash: eski yozuvni isActive=false, yangi yozuv yaratiladi
export const update = async (id, body, currentUser) => {
  const old = await TeacherGroupRate.findById(id);
  if (!old) throw new ApiError(404, "Stavka topilmadi");

  // Yangi stavka qaysi sanadan kuchga kiradi (eski stavka shu sanada yopiladi)
  const effectiveFrom = body.effectiveFrom
    ? new Date(body.effectiveFrom)
    : new Date();

  // Eski yozuvni deaktivatsiya + DAVRINI YOPAMIZ (effectiveTo).
  // Aks holda maosh hisobi eski va yangi stavkani bir oyda ikki marta
  // sanab, o'qituvchiga ortiqcha to'lov yozadi (effectiveTo: null qolib ketardi).
  old.isActive = false;
  old.effectiveTo = effectiveFrom;
  await old.save();

  const merged = {
    teacher: body.teacher !== undefined ? body.teacher : old.teacher,
    group: body.group !== undefined ? body.group : old.group,
    calculationType:
      body.calculationType !== undefined
        ? body.calculationType
        : old.calculationType,
    fixedAmount:
      body.fixedAmount !== undefined ? body.fixedAmount : old.fixedAmount,
    hourlyRate:
      body.hourlyRate !== undefined ? body.hourlyRate : old.hourlyRate,
    hoursPerSession:
      body.hoursPerSession !== undefined
        ? body.hoursPerSession
        : old.hoursPerSession,
    percentageRate:
      body.percentageRate !== undefined
        ? body.percentageRate
        : old.percentageRate,
    amountPerStudent:
      body.amountPerStudent !== undefined
        ? body.amountPerStudent
        : old.amountPerStudent,
    minMonthlyAmount:
      body.minMonthlyAmount !== undefined
        ? body.minMonthlyAmount
        : old.minMonthlyAmount,
    notes: body.notes !== undefined ? body.notes : old.notes,
  };

  return TeacherGroupRate.create({
    ...buildPayload(merged),
    isActive: true,
    effectiveFrom,
    createdBy: currentUser?._id || null,
  });
};

export const remove = async (id) => {
  const doc = await TeacherGroupRate.findById(id);
  if (!doc) throw new ApiError(404, "Stavka topilmadi");
  doc.isActive = false;
  await doc.save();
  return doc;
};
