import StudentFreeze from "../../../models/studentFreeze.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { correlationCacheInvalidate } from "../../../helpers/correlationCache.js";
import logger from "../../../config/logger.js";
import * as studentPaymentService from "../../finance/services/studentPayment.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";

const monthIndex = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();

// Muzlatish o'zgarganda moliya qayta hisoblanadi (M1 tuzatish): avval
// o'quvchining barcha to'lov snapshot'lari (muzlatilgan kunlar expected'dan
// tushadi), so'ng muzlatish davriga tegib o'tgan oylarning o'qituvchi foiz
// maoshlari (guruh billed tushumi o'zgargani uchun). Best-effort.
// intervals: [{start: Date, end: Date|null}] - eski VA yangi davr (update'da ikkalasi).
const recalcFinanceForFreeze = async (studentId, intervals) => {
  try {
    await studentPaymentService.recalcForStudent(studentId);

    const payments = await StudentPayment.find(
      { student: studentId },
      { group: 1, year: 1, month: 1 },
    ).lean();

    const touches = (year, month) => {
      const idx = year * 12 + (month - 1);
      return intervals.some(({ start, end }) => {
        if (!start) return false;
        const s = monthIndex(start);
        const e = end ? monthIndex(end) : Infinity;
        return idx >= s && idx <= e;
      });
    };

    const seen = new Set();
    for (const p of payments) {
      if (!touches(p.year, p.month)) continue;
      const key = `${p.group}-${p.year}-${p.month}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await teacherSalaryService.recalcForGroupMonth(p.group, p.year, p.month);
    }
  } catch (err) {
    logger.warn({ err }, "Muzlatish o'zgarishida moliya qayta hisoblanmadi");
  }
};

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
  await recalcFinanceForFreeze(created.student, [
    { start: created.startDate, end: created.endDate },
  ]);
  return created;
};

export const update = async (id, body) => {
  const doc = await getById(id);

  // Eski davr ham recalc qamroviga kirsin (davr ko'chirilsa ikkala oy to'g'rilanadi)
  const prevInterval = { start: doc.startDate, end: doc.endDate };

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
  await recalcFinanceForFreeze(doc.student, [
    prevInterval,
    { start: doc.startDate, end: doc.endDate },
  ]);
  return doc;
};

export const remove = async (id) => {
  const doc = await getById(id);
  await doc.softDelete();
  correlationCacheInvalidate();
  await recalcFinanceForFreeze(doc.student, [
    { start: doc.startDate, end: doc.endDate },
  ]);
  return doc;
};
