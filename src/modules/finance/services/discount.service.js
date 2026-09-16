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
import * as depositService from "../../deposits/services/deposit.service.js";
import {
  PERIOD_KEYS,
  discountsInMonthFilter,
  normalizePeriod,
  periodError,
  periodOf,
  samePeriod,
} from "./discountPeriod.helper.js";

// Chegirma kamaysa/olib tashlansa expected oshadi - ya'ni qarz paydo bo'ladi.
// Shu sababli har bir qayta hisoblashdan keyin depozitdan avto-qoplaymiz.
const autoApplyAfterRecalc = (studentId) => depositService.safeAutoApply(studentId);

// Chegirma o'quvchi expected'ini → guruh billed tushumini → o'qituvchi foiz maoshini o'zgartiradi.
const recalcTeacherForMonths = async (group, months) => {
  try {
    for (const { year, month } of months) {
      await teacherSalaryService.recalcForGroupMonth(group, year, month);
    }
  } catch (err) {
    logger.warn({ err }, "Chegirma o'zgarishida o'qituvchi maoshi qayta hisoblanmadi");
  }
};

// Faqat davrga tushgan oylar qayta hisoblanadi - boshqa oylarga chegirma tegmaydi.
const recalcForDiscount = async (doc, periods) => {
  const months = await studentPaymentService.recalcForStudentScope(
    doc.student,
    doc.group,
    periods,
  );
  await autoApplyAfterRecalc(doc.student);
  await recalcTeacherForMonths(doc.group, months);
};

const assertValid = ({ type, value, ...period }) => {
  if (type === "percent" && value > 100) {
    throw new ApiError(400, "Foiz 100 dan oshmasligi kerak");
  }
  const message = periodError(period);
  if (message) throw new ApiError(400, message);
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
  if (year && month) {
    Object.assign(filter, discountsInMonthFilter(Number(year), Number(month)));
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
  const period = normalizePeriod(body);
  assertValid({ type: body.type, value: body.value, ...period });
  await ensureStudentAndGroup(body.student, body.group);

  // Double-submit himoyasi: aynan bir xil faol chegirma ikki marta yozilmasin
  // (ikkalasi ham qo'llanib, expected ikki baravar kamayib ketardi).
  const duplicate = await Discount.findOne({
    student: body.student,
    group: body.group,
    type: body.type,
    value: body.value,
    ...period,
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
    ...period,
    reason: body.reason || "",
    createdBy: currentUser?._id || null,
  });

  await recalcForDiscount(doc, period);
  return doc;
};

export const update = async (id, body) => {
  const doc = await Discount.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!doc) throw new ApiError(404, "Chegirma topilmadi");

  // Mutatsiyadan OLDINGI davr - davr o'zgarsa eski oy(lar) snapshot'ida
  // chegirma "muzlab" qolmasligi uchun ularni ham qayta hisoblaymiz (H4).
  const prevPeriod = periodOf(doc);
  const merged = { ...prevPeriod };
  for (const key of PERIOD_KEYS) {
    if (body[key] !== undefined) merged[key] = body[key];
  }
  const nextPeriod = normalizePeriod(merged);
  const type = body.type ?? doc.type;
  const value = body.value ?? doc.value;
  assertValid({ type, value, ...nextPeriod });

  doc.set({ type, value, ...nextPeriod });
  if (body.reason !== undefined) doc.reason = body.reason;
  if (body.isActive !== undefined) doc.isActive = body.isActive;
  await doc.save();

  await recalcForDiscount(
    doc,
    samePeriod(prevPeriod, nextPeriod) ? nextPeriod : [prevPeriod, nextPeriod],
  );
  return doc;
};

export const remove = async (id, currentUser) => {
  const doc = await Discount.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!doc) throw new ApiError(404, "Chegirma topilmadi");
  await doc.softDelete(currentUser?._id);
  await recalcForDiscount(doc, periodOf(doc));
  return { _id: id };
};
