import AttendanceExemption from "../../../models/attendanceExemption.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  ensureActiveGroup,
  ensureTeacherOwnsStudent,
} from "../../../helpers/membership.helper.js";
import { correlationCacheInvalidate } from "../../../helpers/correlationCache.js";

const ensureStudent = async (studentId) => {
  const u = await User.findById(studentId);
  if (!u || u.role !== ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchi topilmadi");
  }
  return u;
};

export const list = async (
  { studentId, isActive, page = 1, limit = 50 },
  currentUser,
) => {
  // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrlarini ko'ra oladi.
  // Shuning uchun studentId majburiy va shu o'quvchi unga tegishli bo'lishi shart.
  if (currentUser?.role === ROLES.TEACHER) {
    if (!studentId) {
      throw new ApiError(400, "O'quvchi tanlanmagan");
    }
    await ensureTeacherOwnsStudent(currentUser._id, studentId);
  }

  const filter = { isDeleted: { $ne: true } };
  if (studentId) filter.student = studentId;
  if (isActive !== undefined) filter.isActive = !!isActive;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AttendanceExemption.find(filter)
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", { firstName: 1, lastName: 1 }),
    AttendanceExemption.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const create = async (body, currentUser) => {
  await ensureStudent(body.student);
  // O'qituvchi faqat o'z guruhidagi o'quvchini ozod qila oladi.
  if (currentUser?.role === ROLES.TEACHER) {
    await ensureTeacherOwnsStudent(currentUser._id, body.student);
  }
  await ensureActiveGroup(body.student);

  const doc = {
    student: body.student,
    startDate: new Date(body.startDate),
    endDate: body.endDate ? new Date(body.endDate) : null,
    daysOfWeek: Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [],
    reason: body.reason || "",
    isActive: body.isActive !== undefined ? !!body.isActive : true,
    createdBy: currentUser?._id || null,
  };

  if (doc.endDate && doc.startDate > doc.endDate) {
    throw new ApiError(400, "Tugash sanasi boshlanishidan keyin bo'lishi kerak");
  }

  const created = await AttendanceExemption.create(doc);
  // Imtiyoz davomat foiziga ta'sir qiladi → korrelatsiya keshini tozalaymiz
  correlationCacheInvalidate();
  return created;
};

export const getById = async (id) => {
  const doc = await AttendanceExemption.findById(id);
  if (!doc) throw new ApiError(404, "Davomatdan ozod davri topilmadi");
  return doc;
};

export const update = async (id, body, currentUser) => {
  const doc = await getById(id);
  // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrini tahrirlay oladi.
  if (currentUser?.role === ROLES.TEACHER) {
    await ensureTeacherOwnsStudent(currentUser._id, doc.student);
  }

  if (body.startDate !== undefined) doc.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) {
    doc.endDate = body.endDate ? new Date(body.endDate) : null;
  }
  if (body.daysOfWeek !== undefined) {
    doc.daysOfWeek = Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [];
  }
  if (body.reason !== undefined) doc.reason = body.reason;
  if (body.isActive !== undefined) doc.isActive = !!body.isActive;

  if (doc.endDate && doc.startDate > doc.endDate) {
    throw new ApiError(400, "Tugash sanasi boshlanishidan keyin bo'lishi kerak");
  }

  await doc.save();
  correlationCacheInvalidate();
  return doc;
};

export const remove = async (id, currentUser) => {
  const doc = await getById(id);
  // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrini o'chira oladi.
  if (currentUser?.role === ROLES.TEACHER) {
    await ensureTeacherOwnsStudent(currentUser._id, doc.student);
  }
  await doc.softDelete();
  correlationCacheInvalidate();
  return doc;
};
