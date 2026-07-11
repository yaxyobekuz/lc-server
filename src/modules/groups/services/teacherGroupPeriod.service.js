import mongoose from "mongoose";
import TeacherGroupPeriod from "../../../models/teacherGroupPeriod.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { toUtcMidnight, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import { assertPeriodInvariants } from "../../../helpers/period.helper.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";

// Maosh stavkasini turiga qarab normallashtiradi (fixed→foiz 0, percent→fiksa 0).
const normalizeRate = (salaryType, fixedAmount, percentRate) => ({
  salaryType: salaryType || "fixed",
  fixedAmount: salaryType === "percent" ? 0 : Number(fixedAmount) || 0,
  percentRate: salaryType === "fixed" ? 0 : Number(percentRate) || 0,
});

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const DAY_MS = 24 * 60 * 60 * 1000;

const fmtDate = (d) => {
  const x = new Date(d);
  const dd = String(x.getUTCDate()).padStart(2, "0");
  const mm = String(x.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${x.getUTCFullYear()}`;
};

// Dars davri guruhning kurs oynasidan chiqmasligini ta'minlaydi:
//  - davr boshlanishi >= guruh boshlanish sanasi (guruhdan oldin dars bo'lmaydi);
//  - davr boshlanishi <= guruh tugash sanasi (kurs tugagach yangi davr ochilmaydi);
//  - davr tugashi (EXCLUSIVE) guruh tugash sanasi + 1 kundan oshmaydi
//    (guruh endDate INKLYUZIV oxirgi kun, davr endDate EKSKLYUZIV).
// group.startDate/endDate bo'sh bo'lsa (eski guruhlar) - tegishli chegara tekshirilmaydi.
const assertWithinGroupBounds = (candidate, group) => {
  if (group?.startDate) {
    const gStart = toUtcMidnight(group.startDate).getTime();
    if (candidate.startDate.getTime() < gStart) {
      throw new ApiError(
        400,
        `Dars davri guruh boshlanish sanasidan (${fmtDate(gStart)}) oldin bo'lishi mumkin emas`,
      );
    }
  }
  if (group?.endDate) {
    const gEndIncl = toUtcMidnight(group.endDate).getTime();
    if (candidate.startDate.getTime() > gEndIncl) {
      throw new ApiError(
        400,
        `Dars davri guruh tugash sanasidan (${fmtDate(gEndIncl)}) keyin boshlanishi mumkin emas`,
      );
    }
    if (candidate.endDate && candidate.endDate.getTime() > gEndIncl + DAY_MS) {
      throw new ApiError(
        400,
        `Dars davri guruh tugash sanasidan (${fmtDate(gEndIncl)}) keyin tugashi mumkin emas`,
      );
    }
  }
};

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

// O'qituvchi+guruhning shu oy bilan kesishadigan MAOSH davrlari (stavka bilan).
// Maosh snapshot hisobida ishlatiladi - oydagi har bir davr alohida proratsiya
// qilinib summalar qo'shiladi.
export const periodsForMonth = async (teacher, group, year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();
  const rows = await TeacherGroupPeriod.find(
    {
      teacher: toObjectId(teacher),
      group: toObjectId(group),
      isDeleted: { $ne: true },
    },
    { startDate: 1, endDate: 1, salaryType: 1, fixedAmount: 1, percentRate: 1 },
  ).lean();
  return rows.filter((r) => {
    const s = new Date(r.startDate).getTime();
    const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
    return s <= monthEnd && e > monthStart;
  });
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

// Davr qamragan oylar ro'yxati (year/month). OY darajasida ishlaydi: oxiri JORIY
// OYGACHA cheklanadi - kelajak OYLAR uchun maosh plani yaratilmaydi (ular oylik
// jobda paydo bo'ladi), lekin joriy oyning kelajak KUNIDA boshlangan davr ham
// joriy oyni qayta hisoblaydi. endDate EXCLUSIVE - oxirgi kun = endDate - 1 kun.
const monthIdx = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();

const monthsSpanned = (startDate, endDateExcl) => {
  const DAY = 24 * 60 * 60 * 1000;
  const curIdx = monthIdx(localTodayMidnight());
  const startIdx = monthIdx(new Date(startDate));
  let endIdx;
  if (endDateExcl) {
    endIdx = monthIdx(new Date(new Date(endDateExcl).getTime() - DAY));
  } else {
    endIdx = curIdx; // ochiq davr → joriy oygacha
  }
  endIdx = Math.min(endIdx, curIdx); // kelajak oylar yo'q
  if (startIdx > endIdx) return [];
  const months = [];
  for (let idx = startIdx; idx <= endIdx; idx += 1) {
    months.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }
  return months;
};

// Oraliqdagi har bir oy uchun maosh planini YARATADI (yo'q bo'lsa) va qayta
// hisoblaydi. Yangi davr qo'shilganda o'sha oy uchun plan darhol paydo bo'ladi.
const recomputeForRange = async (teacher, group, startDate, endDate) => {
  const teacherSalaryService = await import(
    "../../teacherSalary/services/teacherSalary.service.js"
  );
  for (const { year, month } of monthsSpanned(startDate, endDate)) {
    const sal = await teacherSalaryService.ensureSalaryForTeacherGroup(
      teacher,
      group,
      year,
      month,
    );
    if (sal) await teacherSalaryService.recalc(sal._id);
  }
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
  { teacher, group, startDate, endDate = null, salaryType, fixedAmount, percentRate },
  currentUser,
) => {
  await assertTeacher(teacher);
  const grp = await Group.findById(group);
  assertGroupActive(grp);

  const candidate = {
    startDate: toUtcMidnight(startDate),
    endDate: endDate ? toUtcMidnight(endDate) : null,
  };
  const existing = await loadScope(teacher, group);
  assertPeriodInvariants(candidate, existing, "date");
  assertWithinGroupBounds(candidate, grp);

  const doc = await TeacherGroupPeriod.create({
    teacher,
    group,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    ...normalizeRate(salaryType, fixedAmount, percentRate),
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
  const grp = await Group.findById(doc.group);
  assertGroupActive(grp);

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
  assertWithinGroupBounds(next, grp);

  const oldStart = doc.startDate;
  const oldEnd = doc.endDate;
  doc.startDate = next.startDate;
  doc.endDate = next.endDate;
  // Maosh stavkasi - berilgan bo'lsa yangilanadi.
  if (patch.salaryType !== undefined) {
    const rate = normalizeRate(patch.salaryType, patch.fixedAmount, patch.percentRate);
    doc.salaryType = rate.salaryType;
    doc.fixedAmount = rate.fixedAmount;
    doc.percentRate = rate.percentRate;
  }
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
  assertGroupActive(await Group.findById(doc.group));

  // To'lov qo'riqlovchisi: davr qamragan oylarda maosh to'lovi (tranzaktsiya)
  // bo'lsa - o'chirib bo'lmaydi (avval to'lovlar o'chirilishi kerak).
  const months = monthsSpanned(doc.startDate, doc.endDate);
  if (months.length) {
    const paid = await SalaryTransaction.findOne({
      teacher: doc.teacher,
      group: doc.group,
      isDeleted: { $ne: true },
      $or: months,
    });
    if (paid) {
      throw new ApiError(
        400,
        "Bu davrga oid maosh to'lovi mavjud. Avval to'lovlarni o'chiring.",
      );
    }
  }

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

// Arxivdan chiqarishda: arxiv yopgan davrni qayta ochadi (endDate=null), agar shu
// scope'da boshqa ochiq davr bo'lmasa (single-open invariant). Maoshni qayta hisoblaydi.
export const reopenPeriod = async (id, currentUser) => {
  const doc = await TeacherGroupPeriod.findById(id);
  if (!doc || doc.isDeleted || doc.endDate === null) return doc || null;
  const open = await TeacherGroupPeriod.findOne({
    teacher: doc.teacher,
    group: doc.group,
    endDate: null,
    isDeleted: { $ne: true },
  });
  if (open) return doc; // boshqa ochiq davr bor - invariant buzilmasin
  doc.endDate = null;
  doc.updatedBy = currentUser?._id || null;
  await doc.save();
  await syncGroupTeachersCache(doc.group);
  await recomputeForRange(doc.teacher, doc.group, doc.startDate, null);
  return doc;
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
