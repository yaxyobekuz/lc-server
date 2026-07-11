import mongoose from "mongoose";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { computePeriodsSnapshot, deriveStatus } from "./salaryCompute.helper.js";
import * as teacherGroupPeriodService from "../../groups/services/teacherGroupPeriod.service.js";

const safeTeacherProjection = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
};

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

// Guruhning o'sha oy hisoblangan (billed) tushumi - foiz maoshi bazasi.
// O'quvchilarning to'lashi kerak bo'lgan summalar yig'indisi (guruh to'lovi,
// proratsiya va chegirma hisobga olingan). Guruh to'lovi o'zgarsa bu ham o'zgaradi.
export const computeGroupRevenue = async (group, year, month) => {
  const agg = await StudentPayment.aggregate([
    { $match: { group: toObjectId(group), year, month, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$expectedAmount" } } },
  ]);
  return agg.length ? agg[0].total : 0;
};

// Bir maosh yozuvi uchun snapshot maydonlarini hisoblaydi (DB dan yuklab).
// MANBA HAQIQATI - shu oy bilan kesishadigan TeacherGroupPeriod davrlari: har biri
// o'z stavkasi (salaryType/fixedAmount/percentRate) va sana oynasi bilan. Bir oyda
// bir o'qituvchining bir nechta davri (maosh o'zgarishi / qayta kelishi) yig'iladi.
// { snap, groupRevenue, rate } qaytaradi - rate = aktiv (oxirgi) davr stavkasi.
const buildSnapshot = async (salary) => {
  const [groupRevenue, periods, group] = await Promise.all([
    computeGroupRevenue(salary.group, salary.year, salary.month),
    teacherGroupPeriodService.periodsForMonth(
      salary.teacher,
      salary.group,
      salary.year,
      salary.month,
    ),
    Group.findById(salary.group, { startDate: 1, endDate: 1 }).lean(),
  ]);

  const snap = computePeriodsSnapshot({
    periods,
    groupRevenue,
    year: salary.year,
    month: salary.month,
    // Guruh kurs oynasiga qisamiz - guruhdan tashqari kunlarga maosh berilmaydi.
    groupStartDate: group?.startDate || null,
    groupEndDate: group?.endDate || null,
  });

  const rate = {
    salaryType: snap.salaryType,
    fixedAmount: snap.fixedAmount,
    percentRate: snap.percentRate,
  };

  return { snap, groupRevenue, rate };
};

// paidAmount ifodasidan status + overpaidAmount ni hisoblaydigan atomik
// update-pipeline bosqichi ("o'qi → hisobla → save" poygasini yo'qotadi).
const paidStatusStage = (newPaidExpr) => ({
  $set: {
    paidAmount: newPaidExpr,
    overpaidAmount: {
      $max: [0, { $subtract: [newPaidExpr, "$expectedAmount"] }],
    },
    status: {
      $switch: {
        branches: [
          { case: { $lte: [newPaidExpr, 0] }, then: "unpaid" },
          { case: { $lt: [newPaidExpr, "$expectedAmount"] }, then: "partial" },
        ],
        default: "paid",
      },
    },
  },
});

// paidAmount ni atomik delta bilan o'zgartiradi. capToRemaining=true bo'lsa,
// yangi paidAmount expectedAmount dan oshadigan bo'lsa - hujjat YANGILANMAYDI
// (null qaytadi): qoldiqdan ortiq to'lovni shartli-atomik to'sish (C3).
export const applyPaidDelta = async (salaryId, delta, { capToRemaining = false } = {}) => {
  const newPaid = { $add: [{ $ifNull: ["$paidAmount", 0] }, delta] };
  const filter = { _id: salaryId };
  if (capToRemaining) {
    filter.$expr = { $lte: [newPaid, "$expectedAmount"] };
  }
  return TeacherSalary.findOneAndUpdate(filter, [paidStatusStage(newPaid)], {
    new: true,
  });
};

// Faol tranzaksiyalar yig'indisidan paidAmount/status ni tiklaydi (repair yo'li).
export const recalcStatus = async (salaryId) => {
  const salary = await TeacherSalary.findById(salaryId);
  if (!salary) return null;
  const agg = await SalaryTransaction.aggregate([
    { $match: { salary: salary._id, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const paidAmount = agg.length ? agg[0].total : 0;
  return TeacherSalary.findByIdAndUpdate(salaryId, [paidStatusStage(paidAmount)], {
    new: true,
  });
};

// Snapshot (maosh/foiz/proratsiya) ni qayta hisoblab, statusni ham yangilaydi.
// Yozish atomik pipeline orqali: status/overpaid DB'dagi JORIY paidAmount'dan
// keltirib chiqariladi - hisob davomida kelib tushgan parallel to'lov buzmaydi.
// Retro o'zgarish expected'ni to'langandan pastga tushirsa, farq overpaidAmount
// sifatida KO'RINADIGAN bo'lib saqlanadi (C6) - clamp bilan yashirilmaydi.
export const recalc = async (salaryId) => {
  const salary = await TeacherSalary.findById(salaryId);
  if (!salary) return null;

  const { snap, groupRevenue, rate } = await buildSnapshot(salary);

  const paidExpr = { $ifNull: ["$paidAmount", 0] };
  return TeacherSalary.findByIdAndUpdate(
    salaryId,
    [
      {
        $set: {
          salaryType: rate.salaryType,
          fixedAmount: rate.fixedAmount,
          percentRate: rate.percentRate,
          workStartDate: snap.workStartDate || null,
          workEndDate: snap.workEndDate || null,
          groupRevenue,
          prorationFactor: snap.prorationFactor,
          payableDays: snap.payableDays,
          totalDays: snap.totalDays,
          proratedFixed: snap.proratedFixed,
          percentAmount: snap.percentAmount,
          baseEarnings: snap.baseEarnings,
          expectedAmount: snap.expectedAmount,
          status: {
            $switch: {
              branches: [
                { case: { $lte: [paidExpr, 0] }, then: "unpaid" },
                { case: { $lt: [paidExpr, snap.expectedAmount] }, then: "partial" },
              ],
              default: "paid",
            },
          },
          overpaidAmount: {
            $max: [0, { $subtract: [paidExpr, snap.expectedAmount] }],
          },
          recalculatedAt: new Date(),
        },
      },
    ],
    { new: true },
  );
};

// Guruh+oy bo'yicha barcha maoshlarni qayta hisoblaydi (guruh tushumi o'zgarganda).
export const recalcForGroupMonth = async (group, year, month) => {
  const salaries = await TeacherSalary.find({ group, year, month }, { _id: 1 });
  for (const s of salaries) await recalc(s._id);
  return salaries.length;
};

// Guruhning barcha oylik maoshlarini qayta hisoblaydi (doimiy chegirma o'zgarganda).
export const recalcForGroup = async (group) => {
  const salaries = await TeacherSalary.find({ group }, { _id: 1 });
  for (const s of salaries) await recalc(s._id);
  return salaries.length;
};

// O'qituvchi guruhga biriktirilganda shu oy maoshini yaratadi (best-effort hook).
// Stavka/ish-oynasi davrlardan (TeacherGroupPeriod) keltirib chiqariladi.
export const ensureSalaryForTeacherGroup = async (teacher, group, year, month) => {
  if (!teacher || !group) return null;
  const exists = await TeacherSalary.findOne({ teacher, group, year, month });
  if (exists) return exists;

  const draft = new TeacherSalary({ teacher, group, year, month, source: "auto" });
  const { snap, groupRevenue, rate } = await buildSnapshot(draft);
  Object.assign(draft, rate, snap);
  draft.groupRevenue = groupRevenue;
  draft.status = deriveStatus(0, snap.expectedAmount);
  draft.recalculatedAt = new Date();

  try {
    return await draft.save();
  } catch (err) {
    if (err?.code === 11000) {
      return TeacherSalary.findOne({ teacher, group, year, month });
    }
    throw err;
  }
};

// Berilgan oy uchun barcha faol guruh o'qituvchilariga maosh yaratadi.
export const generateMonth = async (year, month) => {
  const groups = await Group.find(
    { isActive: true, isDeleted: { $ne: true } },
    { _id: 1 },
  );
  let created = 0;
  for (const g of groups) {
    // Shu OYDA dars bergan o'qituvchilar (TeacherGroupPeriod overlap) - tarixiy
    // generatsiyada ham o'sha davrdagi haqiqiy o'qituvchilar olinadi.
    const periods = await teacherGroupPeriodService.teacherPeriodsActiveInMonth(
      g._id,
      year,
      month,
    );
    const teacherIds = [...new Set(periods.map((p) => String(p.teacher)))];
    for (const teacherId of teacherIds) {
      const existed = await TeacherSalary.findOne({
        teacher: teacherId,
        group: g._id,
        year,
        month,
      });
      if (existed) continue;
      await ensureSalaryForTeacherGroup(teacherId, g._id, year, month);
      created += 1;
    }
  }
  return { groups: groups.length, created };
};

// (upsertSalary olib tashlandi - stavka/ish-oynasi endi TeacherGroupPeriod
// davrlaridan derived. Maosh o'zgartirish faqat davrlar orqali bo'ladi.)

// (markTeacherLeft olib tashlandi - ish tugashi endi TeacherGroupPeriod davrini
// yopish orqali bo'ladi; maosh proratsiyasi davrlardan derived - teacherGroupPeriod
// service unassignTeacher recompute qiladi.)

export const list = async ({
  groupId,
  teacherId,
  year,
  month,
  status,
  search,
  page = 1,
  limit = 200,
}) => {
  const filter = { isDeleted: { $ne: true } };
  if (groupId) filter.group = toObjectId(groupId);
  if (teacherId) filter.teacher = toObjectId(teacherId);
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);
  if (status) filter.status = status;

  // Qidiruv DB darajasida (filtrga kiradi) - aks holda sahifalab bo'lingandan
  // KEYIN filtrlash noto'g'ri sahifa/total berardi (studentPayment.list bilan bir xil).
  if (search && search.trim()) {
    const s = search.trim();
    const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const matchedTeachers = await User.find(
      {
        role: ROLES.TEACHER,
        $or: [{ firstName: rx }, { lastName: rx }, { username: rx }],
      },
      { _id: 1 },
    );
    filter.teacher = { $in: matchedTeachers.map((u) => u._id) };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TeacherSalary.find(filter)
      .populate("teacher", safeTeacherProjection)
      .populate("group", { name: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    TeacherSalary.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const salary = await TeacherSalary.findById(id)
    .populate("teacher", safeTeacherProjection)
    .populate("group", { name: 1 });
  if (!salary) throw new ApiError(404, "Maosh topilmadi");

  const transactions = await SalaryTransaction.find({
    salary: salary._id,
    isDeleted: { $ne: true },
  }).sort({ paidAt: -1, createdAt: -1 });

  return { ...salary.toJSON(), transactions };
};

// Bitta o'qituvchining barcha oylardagi maoshlari + har biriga tegishli
// to'lovlar (maosh to'lovlari tarixi sahifasi uchun). Eng yangi oy yuqorida.
export const historyByTeacher = async (teacherId) => {
  const tid = toObjectId(teacherId);
  const teacher = await User.findById(tid, safeTeacherProjection).lean();
  if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

  const salaries = await TeacherSalary.find({ teacher: tid, isDeleted: { $ne: true } })
    .populate("group", { name: 1 })
    .sort({ year: -1, month: -1 })
    .lean();

  const ids = salaries.map((s) => s._id);
  const txs = ids.length
    ? await SalaryTransaction.find({
        salary: { $in: ids },
        isDeleted: { $ne: true },
      })
        .sort({ paidAt: -1, createdAt: -1 })
        .lean()
    : [];

  const txBySalary = new Map();
  for (const t of txs) {
    const key = String(t.salary);
    if (!txBySalary.has(key)) txBySalary.set(key, []);
    txBySalary.get(key).push(t);
  }

  const items = salaries.map((s) => ({
    ...s,
    transactions: txBySalary.get(String(s._id)) || [],
  }));

  const totalExpected = items.reduce((s, p) => s + (p.expectedAmount || 0), 0);
  const totalPaid = items.reduce((s, p) => s + (p.paidAmount || 0), 0);

  return {
    teacher,
    items,
    summary: {
      months: items.length,
      totalExpected,
      totalPaid,
      totalRemaining: Math.max(0, totalExpected - totalPaid),
    },
  };
};

// O'qituvchining O'ZI uchun moliya ko'rinishi (teacher panel "Moliya" bo'limi).
// Faqat req.user._id bilan chaqiriladi - ruxsat tekshiruvi shart emas (o'z
// ma'lumotini ko'radi).
export const myFinance = async (teacherId) => historyByTeacher(teacherId);

// Majburiyatlar: qoldig'i (expected - paid) > 0 bo'lgan maoshlar.
// month berilmasa - tanlangan yilning BARCHA oylari bo'yicha (har oy alohida qator).
export const obligations = async ({ groupId, year, month }) => {
  const filter = { year: Number(year), isDeleted: { $ne: true } };
  if (month) filter.month = Number(month);
  if (groupId) filter.group = toObjectId(groupId);

  const items = await TeacherSalary.find(filter)
    .populate("teacher", safeTeacherProjection)
    .populate("group", { name: 1 })
    .sort({ month: 1, createdAt: -1 });

  return items
    .map((s) => ({ ...s.toJSON(), remaining: Math.max(0, s.expectedAmount - s.paidAmount) }))
    .filter((s) => s.remaining > 0);
};
