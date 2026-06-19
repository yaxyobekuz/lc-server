import mongoose from "mongoose";
import Discount from "../../../models/discount.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import { ROLES } from "../../../constants/roles.js";
import * as studentPaymentService from "./studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";

// Chegirma o'quvchi expected'ini → guruh billed tushumini → o'qituvchi foiz maoshini o'zgartiradi.
const recalcTeacherForDiscount = async (doc) => {
  try {
    if (doc.scope === "monthly" && doc.year && doc.month) {
      await teacherSalaryService.recalcForGroupMonth(doc.group, doc.year, doc.month);
    } else {
      await teacherSalaryService.recalcForGroup(doc.group);
    }
  } catch (err) {
    logger.warn({ err }, "Chegirma o'zgarishida o'qituvchi maoshi qayta hisoblanmadi");
  }
};

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const studentProjection = { firstName: 1, lastName: 1, username: 1, phone: 1 };

export const list = async ({ studentId, groupId, year, month, page = 1, limit = 50 }) => {
  const filter = { isDeleted: { $ne: true } };
  if (studentId) filter.student = toObjectId(studentId);
  if (groupId) filter.group = toObjectId(groupId);
  // Oy filtri: o'sha oyga tegishli monthly + barcha permanent
  if (year && month) {
    filter.$or = [
      { scope: "permanent" },
      { scope: "monthly", year: Number(year), month: Number(month) },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Discount.find(filter)
      .populate("student", studentProjection)
      .populate("group", { name: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Discount.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

const ensureStudentAndGroup = async (studentId, groupId) => {
  const [student, group] = await Promise.all([
    User.findOne({ _id: studentId, role: ROLES.STUDENT, isDeleted: { $ne: true } }),
    Group.findOne({ _id: groupId, isDeleted: { $ne: true } }),
  ]);
  if (!student) throw new ApiError(400, "O'quvchi topilmadi");
  assertGroupActive(group);
};

export const create = async (body, currentUser) => {
  await ensureStudentAndGroup(body.student, body.group);

  // Double-submit himoyasi: aynan bir xil faol chegirma ikki marta yozilmasin
  // (ikkalasi ham qo'llanib, expected ikki baravar kamayib ketardi).
  const duplicate = await Discount.findOne({
    student: body.student,
    group: body.group,
    type: body.type,
    value: body.value,
    scope: body.scope,
    year: body.scope === "monthly" ? body.year : null,
    month: body.scope === "monthly" ? body.month : null,
    isActive: true,
    isDeleted: { $ne: true },
  });
  if (duplicate) {
    throw new ApiError(409, "Xuddi shunday faol chegirma allaqachon mavjud");
  }

  const doc = await Discount.create({
    student: body.student,
    group: body.group,
    type: body.type,
    value: body.value,
    scope: body.scope,
    year: body.scope === "monthly" ? body.year : null,
    month: body.scope === "monthly" ? body.month : null,
    reason: body.reason || "",
    createdBy: currentUser?._id || null,
  });

  await studentPaymentService.recalcForStudentScope(doc.student, doc.group, {
    scope: doc.scope,
    year: doc.year,
    month: doc.month,
  });
  await recalcTeacherForDiscount(doc);
  return doc;
};

export const update = async (id, body) => {
  const doc = await Discount.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!doc) throw new ApiError(404, "Chegirma topilmadi");

  // Mutatsiyadan OLDINGI qamrov - scope/oy o'zgarsa eski oy(lar) snapshot'ida
  // chegirma "muzlab" qolmasligi uchun ularni ham qayta hisoblaymiz (H4).
  const prevScope = { scope: doc.scope, year: doc.year, month: doc.month };

  if (body.type !== undefined) doc.type = body.type;
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

  const scopeChanged =
    prevScope.scope !== doc.scope ||
    prevScope.year !== doc.year ||
    prevScope.month !== doc.month;
  if (scopeChanged) {
    await studentPaymentService.recalcForStudentScope(doc.student, doc.group, prevScope);
    await recalcTeacherForDiscount({ group: doc.group, ...prevScope });
  }

  await studentPaymentService.recalcForStudentScope(doc.student, doc.group, {
    scope: doc.scope,
    year: doc.year,
    month: doc.month,
  });
  await recalcTeacherForDiscount(doc);
  return doc;
};

export const remove = async (id, currentUser) => {
  const doc = await Discount.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!doc) throw new ApiError(404, "Chegirma topilmadi");
  await doc.softDelete(currentUser?._id);
  await studentPaymentService.recalcForStudentScope(doc.student, doc.group, {
    scope: doc.scope,
    year: doc.year,
    month: doc.month,
  });
  await recalcTeacherForDiscount(doc);
  return { _id: id };
};
