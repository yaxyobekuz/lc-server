import mongoose from "mongoose";
import TeacherGroupPeriod from "../../../models/teacherGroupPeriod.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { toUtcMidnight, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import { assertPeriodInvariants, monthToIndex } from "../../../helpers/period.helper.js";

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const DAY = 24 * 60 * 60 * 1000;

// --- RESOLVERLAR ---

// Berilgan sanada (default bugun) guruhda dars berayotgan o'qituvchi id'lari.
export const activeTeacherIdsForGroup = async (group, onDate = null) => {
  const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
  const rows = await TeacherGroupPeriod.find(
    { group: toObjectId(group), isDeleted: { $ne: true } },
    { teacher: 1, startDate: 1, endDate: 1 },
  ).lean();
  const ids = [];
  for (const r of rows) {
    const s = new Date(r.startDate).getTime();
    const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
    if (t >= s && t < e) ids.push(r.teacher);
  }
  return ids;
};

// Berilgan oy bilan kesishadigan (dars bergan) o'qituvchi davrlari - maosh
// generatsiyasi uchun. Oy [monthStart, monthEnd] bilan overlap.
export const teacherPeriodsActiveInMonth = async (group, year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();
  const rows = await TeacherGroupPeriod.find(
    { group: toObjectId(group), isDeleted: { $ne: true } },
    { teacher: 1, startDate: 1, endDate: 1 },
  ).lean();
  return rows.filter((r) => {
    const s = new Date(r.startDate).getTime();
    const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
    return s <= monthEnd && e > monthStart;
  });
};

// O'qituvchining bir oydagi ish holati (maosh proratsiyasi uchun). Qaytaradi:
//  - { mode:"active", workStartDate, workEndDate(INCLUSIVE) } - shu oyda dars bergan;
//  - { mode:"inactive" } - davrlar bor, lekin shu oyda dars bermagan → maosh 0;
//  - { mode:"none" } - bu juftlik uchun umuman davr yo'q (migratsiya qilinmagan)
//    → chaqiruvchi yozuvning eski workStartDate/workEndDate maydonlariga qaytadi.
// endDate EXCLUSIVE saqlanadi - inclusive oxirgi kun = endDate - 1 kun.
export const resolveWorkForMonth = async (teacher, group, year, month) => {
  const all = await TeacherGroupPeriod.find(
    { teacher: toObjectId(teacher), group: toObjectId(group), isDeleted: { $ne: true } },
    { startDate: 1, endDate: 1 },
  ).lean();
  if (!all.length) return { mode: "none" };

  const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();
  const mine = all.filter((p) => {
    const s = new Date(p.startDate).getTime();
    const e = p.endDate ? new Date(p.endDate).getTime() : Infinity;
    return s <= monthEnd && e > monthStart;
  });
  if (!mine.length) return { mode: "inactive" };

  // Oddiy holat: oyda bitta davr. Bir nechta bo'lsa - eng keng oyna (start min, end max).
  let start = Infinity;
  let endExcl = -Infinity;
  let open = false;
  for (const p of mine) {
    start = Math.min(start, new Date(p.startDate).getTime());
    if (!p.endDate) open = true;
    else endExcl = Math.max(endExcl, new Date(p.endDate).getTime());
  }
  return {
    mode: "active",
    workStartDate: new Date(start),
    workEndDate: open ? null : new Date(endExcl - DAY),
  };
};

// Guruhda hozir aktiv o'qituvchilar bo'lgan guruh id'lari (teacher uchun).
export const activeGroupIdsForTeacher = async (teacher, onDate = null) => {
  const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
  const rows = await TeacherGroupPeriod.find(
    { teacher: toObjectId(teacher), isDeleted: { $ne: true } },
    { group: 1, startDate: 1, endDate: 1 },
  ).lean();
  const ids = [];
  for (const r of rows) {
    const s = new Date(r.startDate).getTime();
    const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
    if (t >= s && t < e) ids.push(r.group);
  }
  return ids;
};

export const listByGroup = async (group) =>
  TeacherGroupPeriod.find({ group: toObjectId(group), isDeleted: { $ne: true } })
    .populate("teacher", { firstName: 1, lastName: 1, username: 1 })
    .sort({ startDate: -1 })
    .lean();

// --- KESH SINXRONI ---

// Group.teachers[] ni davrlardan HOSILA kesh sifatida yangilaydi (hozir aktivlar).
// Manba - davrlar; teachers[] faqat so'rov tezligi uchun denormalizatsiya.
export const syncGroupTeachersCache = async (group) => {
  const ids = await activeTeacherIdsForGroup(group);
  await Group.findByIdAndUpdate(group, {
    $set: { teachers: ids.map((id) => toObjectId(id)) },
  });
  return ids;
};

// --- RECOMPUTE (o'zgargan oylardagi shu o'qituvchi maoshi) ---

const recomputeSalaries = async (teacher, group, fromTs, toTs) => {
  const teacherSalaryService = await import(
    "../../teacherSalary/services/teacherSalary.service.js"
  );
  const fromIdx = monthToIndex(
    new Date(fromTs).getUTCFullYear(),
    new Date(fromTs).getUTCMonth() + 1,
  );
  const toIdx = monthToIndex(
    new Date(toTs).getUTCFullYear(),
    new Date(toTs).getUTCMonth() + 1,
  );
  const salaries = await TeacherSalary.find(
    { teacher: toObjectId(teacher), group: toObjectId(group) },
    { _id: 1, year: 1, month: 1 },
  ).lean();
  for (const s of salaries) {
    const idx = monthToIndex(s.year, s.month);
    if (idx >= fromIdx && idx <= toIdx) await teacherSalaryService.recalc(s._id);
  }
};

const recomputeForRange = async (teacher, group, startDate, endDate) => {
  const fromTs = new Date(startDate).getTime();
  const toTs = endDate ? new Date(endDate).getTime() : localTodayMidnight().getTime();
  await recomputeSalaries(teacher, group, fromTs, Math.max(fromTs, toTs));
};

// --- CRUD (invariant-li) ---

const assertTeacher = async (teacher) => {
  const doc = await User.findOne({ _id: teacher, role: ROLES.TEACHER, isDeleted: { $ne: true } });
  if (!doc) throw new ApiError(400, "O'qituvchi topilmadi");
  return doc;
};

const loadScope = async (teacher, group, excludeId) => {
  const filter = { teacher: toObjectId(teacher), group: toObjectId(group), isDeleted: { $ne: true } };
  if (excludeId) filter._id = { $ne: toObjectId(excludeId) };
  return TeacherGroupPeriod.find(filter).lean();
};

export const create = async (
  { teacher, group, startDate, endDate = null },
  currentUser,
) => {
  await assertTeacher(teacher);
  const grp = await Group.findById(group);
  if (!grp) throw new ApiError(404, "Guruh topilmadi");

  const candidate = {
    startDate: toUtcMidnight(startDate),
    endDate: endDate ? toUtcMidnight(endDate) : null,
  };
  const existing = await loadScope(teacher, group);
  assertPeriodInvariants(candidate, existing, "date");

  const doc = await TeacherGroupPeriod.create({
    teacher,
    group,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    createdBy: currentUser?._id || null,
    updatedBy: currentUser?._id || null,
  });
  await syncGroupTeachersCache(group);
  await recomputeForRange(teacher, group, candidate.startDate, candidate.endDate);
  return doc;
};

export const update = async (id, patch, currentUser) => {
  const doc = await TeacherGroupPeriod.findById(id);
  if (!doc || doc.isDeleted) throw new ApiError(404, "Dars berish davri topilmadi");

  const next = {
    startDate: patch.startDate ? toUtcMidnight(patch.startDate) : doc.startDate,
    endDate:
      patch.endDate === undefined
        ? doc.endDate
        : patch.endDate
          ? toUtcMidnight(patch.endDate)
          : null,
  };
  const existing = await loadScope(doc.teacher, doc.group, doc._id);
  assertPeriodInvariants(next, existing, "date");

  const oldStart = doc.startDate;
  const oldEnd = doc.endDate;
  doc.startDate = next.startDate;
  doc.endDate = next.endDate;
  doc.updatedBy = currentUser?._id || null;
  await doc.save();

  await syncGroupTeachersCache(doc.group);
  await recomputeForRange(doc.teacher, doc.group, oldStart, oldEnd);
  await recomputeForRange(doc.teacher, doc.group, next.startDate, next.endDate);
  return doc;
};

export const remove = async (id) => {
  const doc = await TeacherGroupPeriod.findById(id);
  if (!doc || doc.isDeleted) throw new ApiError(404, "Dars berish davri topilmadi");
  await doc.softDelete();
  await syncGroupTeachersCache(doc.group);
  await recomputeForRange(doc.teacher, doc.group, doc.startDate, doc.endDate);
  return { _id: doc._id };
};

// --- ERGONOMIK ASSIGN / UNASSIGN ---

// O'qituvchini guruhga biriktiradi (ochiq davr ochadi). startDate default bugun.
export const assignTeacher = async (group, teacher, { startDate } = {}, currentUser) => {
  const open = await TeacherGroupPeriod.findOne({
    teacher: toObjectId(teacher),
    group: toObjectId(group),
    endDate: null,
    isDeleted: { $ne: true },
  });
  if (open) return open; // allaqachon aktiv
  const grp = await Group.findById(group);
  const start = startDate
    ? toUtcMidnight(startDate)
    : grp?.startDate
      ? toUtcMidnight(grp.startDate)
      : localTodayMidnight();
  return create({ group, teacher, startDate: start }, currentUser);
};

// O'qituvchini guruhdan chiqaradi (ochiq davrni endDate da yopadi). EXCLUSIVE.
export const unassignTeacher = async (group, teacher, { endDate } = {}, currentUser) => {
  const open = await TeacherGroupPeriod.findOne({
    teacher: toObjectId(teacher),
    group: toObjectId(group),
    endDate: null,
    isDeleted: { $ne: true },
  });
  if (!open) return null;
  const end = endDate ? toUtcMidnight(endDate) : localTodayMidnight();
  open.endDate = end;
  open.updatedBy = currentUser?._id || null;
  await open.save();
  await syncGroupTeachersCache(group);
  await recomputeForRange(teacher, group, open.startDate, end);
  logger.info({ teacher, group }, "O'qituvchi guruhdan chiqarildi (davr yopildi)");
  return open;
};
