import mongoose from "mongoose";
import SalaryAdjustment from "../../../models/salaryAdjustment.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import * as teacherSalaryService from "./teacherSalary.service.js";

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const teacherProjection = { firstName: 1, lastName: 1, username: 1, phone: 1 };

export const list = async ({ teacherId, groupId, year, month, kind, page = 1, limit = 50 }) => {
  const filter = { isDeleted: { $ne: true } };
  if (teacherId) filter.teacher = toObjectId(teacherId);
  if (groupId) filter.group = toObjectId(groupId);
  if (kind) filter.kind = kind;
  if (year && month) {
    filter.$or = [
      { scope: "permanent" },
      { scope: "monthly", year: Number(year), month: Number(month) },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    SalaryAdjustment.find(filter)
      .populate("teacher", teacherProjection)
      .populate("group", { name: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SalaryAdjustment.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const ensureTeacherAndGroup = async (teacherId, groupId) => {
  const [teacher, group] = await Promise.all([
    User.findOne({ _id: teacherId, role: ROLES.TEACHER, isDeleted: { $ne: true } }),
    Group.findOne({ _id: groupId, isDeleted: { $ne: true } }),
  ]);
  if (!teacher) throw new ApiError(400, "O'qituvchi topilmadi");
  if (!group) throw new ApiError(400, "Guruh topilmadi");
};

export const create = async (body, currentUser) => {
  await ensureTeacherAndGroup(body.teacher, body.group);

  const doc = await SalaryAdjustment.create({
    teacher: body.teacher,
    group: body.group,
    kind: body.kind,
    valueType: body.valueType,
    value: body.value,
    scope: body.scope,
    year: body.scope === "monthly" ? body.year : null,
    month: body.scope === "monthly" ? body.month : null,
    reason: body.reason || "",
    createdBy: currentUser?._id || null,
  });

  await teacherSalaryService.recalcForTeacherScope(doc.teacher, doc.group, {
    scope: doc.scope,
    year: doc.year,
    month: doc.month,
  });
  return doc;
};

export const update = async (id, body) => {
  const doc = await SalaryAdjustment.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!doc) throw new ApiError(404, "Yozuv topilmadi");

  if (body.kind !== undefined) doc.kind = body.kind;
  if (body.valueType !== undefined) doc.valueType = body.valueType;
  if (body.value !== undefined) doc.value = body.value;
  if (body.scope !== undefined) doc.scope = body.scope;
  if (body.reason !== undefined) doc.reason = body.reason;
  if (body.isActive !== undefined) doc.isActive = body.isActive;
  if (doc.scope === "monthly") {
    if (body.year !== undefined) doc.year = body.year;
    if (body.month !== undefined) doc.month = body.month;
  } else {
    doc.year = null;
    doc.month = null;
  }
  await doc.save();

  await teacherSalaryService.recalcForTeacherScope(doc.teacher, doc.group, {
    scope: doc.scope,
    year: doc.year,
    month: doc.month,
  });
  return doc;
};

export const remove = async (id, currentUser) => {
  const doc = await SalaryAdjustment.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!doc) throw new ApiError(404, "Yozuv topilmadi");
  await doc.softDelete(currentUser?._id);
  await teacherSalaryService.recalcForTeacherScope(doc.teacher, doc.group, {
    scope: doc.scope,
    year: doc.year,
    month: doc.month,
  });
  return { _id: id };
};
