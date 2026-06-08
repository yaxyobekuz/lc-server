import StudentFreeze from "../../../models/studentFreeze.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { correlationCacheInvalidate } from "../../../helpers/correlationCache.js";

const ensureStudent = async (studentId) => {
  const u = await User.findById(studentId);
  if (!u || u.role !== ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchi topilmadi");
  }
  return u;
};

export const list = async ({ studentId, isActive, page = 1, limit = 50 }) => {
  const filter = { isDeleted: { $ne: true } };
  if (studentId) filter.student = studentId;
  if (isActive !== undefined) filter.isActive = !!isActive;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    StudentFreeze.find(filter)
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", { firstName: 1, lastName: 1 }),
    StudentFreeze.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await StudentFreeze.findById(id);
  if (!doc) throw new ApiError(404, "Muzlatish topilmadi");
  return doc;
};

export const create = async (body, currentUser) => {
  await ensureStudent(body.student);

  const doc = {
    student: body.student,
    startDate: new Date(body.startDate),
    endDate: body.endDate ? new Date(body.endDate) : null,
    reason: body.reason || "",
    isActive: body.isActive !== undefined ? !!body.isActive : true,
    createdBy: currentUser?._id || null,
  };
  if (doc.endDate && doc.startDate > doc.endDate) {
    throw new ApiError(400, "Tugash sanasi boshlanishidan keyin bo'lishi kerak");
  }

  const created = await StudentFreeze.create(doc);
  correlationCacheInvalidate();
  return created;
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.startDate !== undefined) doc.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) {
    doc.endDate = body.endDate ? new Date(body.endDate) : null;
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

export const remove = async (id) => {
  const doc = await getById(id);
  await doc.softDelete();
  correlationCacheInvalidate();
  return doc;
};
