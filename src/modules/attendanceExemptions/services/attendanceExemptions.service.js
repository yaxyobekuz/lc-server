import AttendanceExemption from "../../../models/attendanceExemption.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { ensureActiveGroup } from "../../../helpers/membership.helper.js";

const ensureStudent = async (studentId) => {
  const u = await User.findById(studentId);
  if (!u || u.role !== ROLES.STUDENT) {
    throw new ApiError(400, "Talaba topilmadi");
  }
  return u;
};

export const list = async ({
  studentId,
  isActive,
  page = 1,
  limit = 50,
}) => {
  const filter = {};
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

  return AttendanceExemption.create(doc);
};

export const getById = async (id) => {
  const doc = await AttendanceExemption.findById(id);
  if (!doc) throw new ApiError(404, "Davomatdan ozod davri topilmadi");
  return doc;
};

export const update = async (id, body) => {
  const doc = await getById(id);

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
  return doc;
};

export const remove = async (id) => {
  const doc = await getById(id);
  await doc.deleteOne();
  return doc;
};
