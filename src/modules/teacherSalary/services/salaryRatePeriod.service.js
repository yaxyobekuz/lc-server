import mongoose from "mongoose";
import TeacherSalaryRatePeriod from "../../../models/teacherSalaryRatePeriod.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  assertPeriodInvariants,
  findPeriodForMonth,
  monthToIndex,
  indexToMonth,
} from "../../../helpers/period.helper.js";

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const normalizeRate = (salaryType, fixedAmount, percentRate) => ({
  salaryType,
  fixedAmount: salaryType === "percent" ? 0 : Math.max(0, fixedAmount || 0),
  percentRate: salaryType === "fixed" ? 0 : Math.max(0, Math.min(100, percentRate || 0)),
});

// --- RESOLVER ---

export const listByPair = async (teacher, group) =>
  TeacherSalaryRatePeriod.find({ teacher: toObjectId(teacher), group: toObjectId(group) })
    .sort({ startYear: -1, startMonth: -1 })
    .lean();

// Berilgan oyga amal qiladigan stavka davri (yoki null).
export const rateForMonth = async (teacher, group, year, month) => {
  const periods = await TeacherSalaryRatePeriod.find({
    teacher: toObjectId(teacher),
    group: toObjectId(group),
  }).lean();
  return findPeriodForMonth(periods, year, month);
};

// --- RECOMPUTE (faqat shu o'qituvchi maoshi - foiz bazasi o'zgarmaydi) ---

const recomputeRange = async (teacher, group, fromIdx, toIdx) => {
  if (toIdx == null || toIdx < fromIdx) return;
  const teacherSalaryService = await import("./teacherSalary.service.js");
  const salaries = await TeacherSalary.find(
    { teacher: toObjectId(teacher), group: toObjectId(group) },
    { _id: 1, year: 1, month: 1 },
  ).lean();
  for (const s of salaries) {
    const idx = monthToIndex(s.year, s.month);
    if (idx >= fromIdx && idx <= toIdx) await teacherSalaryService.recalc(s._id);
  }
};

const latestMaterializedIndex = async (teacher, group) => {
  const rows = await TeacherSalary.find(
    { teacher: toObjectId(teacher), group: toObjectId(group) },
    { year: 1, month: 1 },
  )
    .sort({ year: -1, month: -1 })
    .limit(1)
    .lean();
  if (!rows.length) return null;
  return monthToIndex(rows[0].year, rows[0].month);
};

const recomputeForPeriod = async (teacher, group, period) => {
  const fromIdx = monthToIndex(period.startYear, period.startMonth);
  const toIdx =
    period.endYear != null && period.endMonth != null
      ? monthToIndex(period.endYear, period.endMonth)
      : await latestMaterializedIndex(teacher, group);
  await recomputeRange(teacher, group, fromIdx, toIdx);
};

// --- CRUD ---

const loadScope = async (teacher, group, excludeId) => {
  const filter = { teacher: toObjectId(teacher), group: toObjectId(group) };
  if (excludeId) filter._id = { $ne: toObjectId(excludeId) };
  return TeacherSalaryRatePeriod.find(filter).lean();
};

const assertTeacherInGroup = async (teacher, group) => {
  const teacherDoc = await User.findOne({
    _id: teacher,
    role: ROLES.TEACHER,
    isDeleted: { $ne: true },
  });
  if (!teacherDoc) throw new ApiError(400, "O'qituvchi topilmadi");
  const grp = await Group.findById(group);
  if (!grp) throw new ApiError(404, "Guruh topilmadi");
  return { teacherDoc, grp };
};

export const create = async (
  { teacher, group, salaryType, fixedAmount, percentRate, startYear, startMonth, endYear = null, endMonth = null },
  currentUser,
) => {
  await assertTeacherInGroup(teacher, group);
  const candidate = { startYear, startMonth, endYear, endMonth };
  const existing = await loadScope(teacher, group);
  assertPeriodInvariants(candidate, existing, "month");

  const doc = await TeacherSalaryRatePeriod.create({
    teacher,
    group,
    ...normalizeRate(salaryType, fixedAmount, percentRate),
    startYear,
    startMonth,
    endYear,
    endMonth,
    createdBy: currentUser?._id || null,
    updatedBy: currentUser?._id || null,
  });
  await recomputeForPeriod(teacher, group, doc);
  return doc;
};

export const update = async (id, patch, currentUser) => {
  const doc = await TeacherSalaryRatePeriod.findById(id);
  if (!doc) throw new ApiError(404, "Maosh stavkasi davri topilmadi");

  const next = {
    startYear: patch.startYear ?? doc.startYear,
    startMonth: patch.startMonth ?? doc.startMonth,
    endYear: patch.endYear === undefined ? doc.endYear : patch.endYear,
    endMonth: patch.endMonth === undefined ? doc.endMonth : patch.endMonth,
  };
  const existing = await loadScope(doc.teacher, doc.group, doc._id);
  assertPeriodInvariants(next, existing, "month");

  const oldRange = { startYear: doc.startYear, startMonth: doc.startMonth, endYear: doc.endYear, endMonth: doc.endMonth };

  if (patch.salaryType !== undefined) {
    Object.assign(doc, normalizeRate(patch.salaryType, patch.fixedAmount ?? doc.fixedAmount, patch.percentRate ?? doc.percentRate));
  }
  doc.startYear = next.startYear;
  doc.startMonth = next.startMonth;
  doc.endYear = next.endYear;
  doc.endMonth = next.endMonth;
  doc.updatedBy = currentUser?._id || null;
  await doc.save();

  await recomputeForPeriod(doc.teacher, doc.group, oldRange);
  await recomputeForPeriod(doc.teacher, doc.group, doc);
  return doc;
};

export const remove = async (id) => {
  const doc = await TeacherSalaryRatePeriod.findById(id);
  if (!doc) throw new ApiError(404, "Maosh stavkasi davri topilmadi");
  const range = { startYear: doc.startYear, startMonth: doc.startMonth, endYear: doc.endYear, endMonth: doc.endMonth };
  await doc.deleteOne();
  await recomputeForPeriod(doc.teacher, doc.group, range);
  return { _id: doc._id };
};

// Ergonomik: "shu oydan boshlab stavka = X" (ochiq davr). Oldingi ochiq davr
// avtomatik yopiladi. Eski TeacherSalaryConfig.upsert o'rnini bosadi.
export const setRateFrom = async (
  { teacher, group, salaryType, fixedAmount, percentRate, year, month },
  currentUser,
) => {
  await assertTeacherInGroup(teacher, group);
  const startIdx = monthToIndex(year, month);

  const open = await TeacherSalaryRatePeriod.findOne({
    teacher: toObjectId(teacher),
    group: toObjectId(group),
    endYear: null,
  });
  if (open) {
    const openIdx = monthToIndex(open.startYear, open.startMonth);
    if (openIdx === startIdx) {
      Object.assign(open, normalizeRate(salaryType, fixedAmount, percentRate));
      open.updatedBy = currentUser?._id || null;
      await open.save();
      await recomputeForPeriod(teacher, group, open);
      return open;
    }
    if (openIdx > startIdx) {
      throw new ApiError(400, "Yangi stavka oyi joriy ochiq davrdan oldin bo'lishi mumkin emas");
    }
    const prevEnd = indexToMonth(startIdx - 1);
    open.endYear = prevEnd.year;
    open.endMonth = prevEnd.month;
    open.updatedBy = currentUser?._id || null;
    await open.save();
  }

  return create(
    { teacher, group, salaryType, fixedAmount, percentRate, startYear: year, startMonth: month },
    currentUser,
  );
};
