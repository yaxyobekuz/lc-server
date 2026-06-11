import mongoose from "mongoose";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import SalaryAdjustment from "../../../models/salaryAdjustment.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { toUtcMidnight } from "../../../helpers/attendance.helper.js";
import { computeSalarySnapshot, deriveStatus } from "./salaryCompute.helper.js";

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
    { $match: { group: toObjectId(group), year, month } },
    { $group: { _id: null, total: { $sum: "$expectedAmount" } } },
  ]);
  return agg.length ? agg[0].total : 0;
};

// Bir maosh yozuvi uchun snapshot maydonlarini hisoblaydi (DB dan yuklab).
const buildSnapshot = async (salary) => {
  const [adjustments, groupRevenue] = await Promise.all([
    SalaryAdjustment.find({
      teacher: salary.teacher,
      group: salary.group,
      isActive: true,
      isDeleted: { $ne: true },
      $or: [
        { scope: "permanent" },
        { scope: "monthly", year: salary.year, month: salary.month },
      ],
    }),
    computeGroupRevenue(salary.group, salary.year, salary.month),
  ]);

  return computeSalarySnapshot({
    salaryType: salary.salaryType,
    fixedAmount: salary.fixedAmount,
    percentRate: salary.percentRate,
    groupRevenue,
    year: salary.year,
    month: salary.month,
    workStartDate: salary.workStartDate,
    workEndDate: salary.workEndDate,
    adjustments,
  });
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

// Snapshot (maosh/foiz/proratsiya/adjustment) ni qayta hisoblab, statusni ham yangilaydi.
// Yozish atomik pipeline orqali: status/overpaid DB'dagi JORIY paidAmount'dan
// keltirib chiqariladi - hisob davomida kelib tushgan parallel to'lov buzmaydi.
// Retro o'zgarish expected'ni to'langandan pastga tushirsa, farq overpaidAmount
// sifatida KO'RINADIGAN bo'lib saqlanadi (C6) - clamp bilan yashirilmaydi.
export const recalc = async (salaryId) => {
  const salary = await TeacherSalary.findById(salaryId);
  if (!salary) return null;

  const snap = await buildSnapshot(salary);
  const groupRevenue = await computeGroupRevenue(salary.group, salary.year, salary.month);

  const paidExpr = { $ifNull: ["$paidAmount", 0] };
  return TeacherSalary.findByIdAndUpdate(
    salaryId,
    [
      {
        $set: {
          groupRevenue,
          prorationFactor: snap.prorationFactor,
          payableDays: snap.payableDays,
          totalDays: snap.totalDays,
          proratedFixed: snap.proratedFixed,
          percentAmount: snap.percentAmount,
          baseEarnings: snap.baseEarnings,
          bonusTotal: snap.bonusTotal,
          fineTotal: snap.fineTotal,
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

// O'qituvchi+guruh bonus/jarimasi o'zgarganda tegishli oylarni qayta hisoblaydi.
export const recalcForTeacherScope = async (teacher, group, { scope, year, month } = {}) => {
  const filter = { teacher, group };
  if (scope === "monthly" && year && month) {
    filter.year = year;
    filter.month = month;
  }
  const salaries = await TeacherSalary.find(filter, { _id: 1 });
  for (const s of salaries) await recalc(s._id);
  return salaries.length;
};

// O'qituvchi guruhga biriktirilganda shu oy maoshini yaratadi (best-effort hook).
export const ensureSalaryForTeacherGroup = async (
  teacher,
  group,
  year,
  month,
  { workStartDate, workEndDate } = {},
) => {
  if (!teacher || !group) return null;
  const exists = await TeacherSalary.findOne({ teacher, group, year, month });
  if (exists) return exists;

  // Carry-forward: o'tgan oy konfiguratsiyasi
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prev = await TeacherSalary.findOne({ teacher, group, year: prevYear, month: prevMonth });

  const draft = new TeacherSalary({
    teacher,
    group,
    year,
    month,
    salaryType: prev ? prev.salaryType : "fixed",
    fixedAmount: prev ? prev.fixedAmount : 0,
    percentRate: prev ? prev.percentRate : 0,
    workStartDate: workStartDate ? toUtcMidnight(workStartDate) : null,
    workEndDate: workEndDate ? toUtcMidnight(workEndDate) : null,
    source: "auto",
  });
  const snap = await buildSnapshot(draft);
  draft.groupRevenue = await computeGroupRevenue(group, year, month);
  Object.assign(draft, snap);
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
    { isActive: true, status: "active", isDeleted: { $ne: true } },
    { _id: 1, teachers: 1 },
  );
  let created = 0;
  for (const g of groups) {
    // BARCHA biriktirilgan o'qituvchilar uchun (massivda bittadan ko'p bo'lsa ham -
    // aks holda faqat birinchisi maosh olardi, qolganlari hisobdan tushib qolardi)
    for (const teacherId of g.teachers || []) {
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

// Maosh konfiguratsiyasini o'rnatadi (upsert), so'ng qayta hisoblaydi.
export const upsertSalary = async (
  { teacher, group, year, month, salaryType, fixedAmount, percentRate, workStartDate, workEndDate },
  currentUser,
) => {
  const grp = await Group.findById(group);
  if (!grp) throw new ApiError(404, "Guruh topilmadi");

  // teacher haqiqatan o'qituvchi roli ekanini tekshiramiz - ixtiyoriy ObjectId
  // (o'quvchi, o'chirilgan user) ga soxta maosh yozuvi yaratib bo'lmasin (M2).
  const teacherDoc = await User.findOne({
    _id: teacher,
    role: ROLES.TEACHER,
    isDeleted: { $ne: true },
  });
  if (!teacherDoc) throw new ApiError(400, "O'qituvchi topilmadi");

  if (workStartDate && workEndDate) {
    const ws = toUtcMidnight(workStartDate);
    const we = toUtcMidnight(workEndDate);
    if (ws && we && we.getTime() < ws.getTime()) {
      throw new ApiError(400, "Ish tugash sanasi boshlanishidan oldin bo'lishi mumkin emas");
    }
  }

  const salary = await TeacherSalary.findOneAndUpdate(
    { teacher, group, year, month },
    {
      $set: {
        salaryType,
        fixedAmount: salaryType === "percent" ? 0 : fixedAmount || 0,
        percentRate: salaryType === "fixed" ? 0 : percentRate || 0,
        workStartDate: workStartDate ? toUtcMidnight(workStartDate) : null,
        workEndDate: workEndDate ? toUtcMidnight(workEndDate) : null,
        source: "manual",
      },
      $setOnInsert: { teacher, group, year, month, createdBy: currentUser?._id || null },
    },
    { upsert: true, new: true },
  );

  return recalc(salary._id);
};

// O'qituvchi guruhda ishni to'xtatganda (almashtirildi/guruh yakunlandi) - shu oy
// maoshiga ish tugatgan sanani belgilab, kunlarga proratsiya qiladi (best-effort).
export const markTeacherLeft = async (teacher, group, year, month, date) => {
  if (!teacher || !group || !date) return null;
  const salary = await TeacherSalary.findOne({ teacher, group, year, month });
  if (!salary) return null;
  salary.workEndDate = toUtcMidnight(date);
  await salary.save();
  return recalc(salary._id);
};

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
  const filter = {};
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

  const [transactions, adjustments] = await Promise.all([
    SalaryTransaction.find({ salary: salary._id, isDeleted: { $ne: true } }).sort({
      paidAt: -1,
      createdAt: -1,
    }),
    SalaryAdjustment.find({
      teacher: salary.teacher._id || salary.teacher,
      group: salary.group._id || salary.group,
      isActive: true,
      isDeleted: { $ne: true },
      $or: [
        { scope: "permanent" },
        { scope: "monthly", year: salary.year, month: salary.month },
      ],
    }).sort({ createdAt: -1 }),
  ]);

  return { ...salary.toJSON(), transactions, adjustments };
};

// Bitta o'qituvchining barcha oylardagi maoshlari + har biriga tegishli
// to'lovlar (maosh to'lovlari tarixi sahifasi uchun). Eng yangi oy yuqorida.
export const historyByTeacher = async (teacherId) => {
  const tid = toObjectId(teacherId);
  const teacher = await User.findById(tid, safeTeacherProjection).lean();
  if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

  const salaries = await TeacherSalary.find({ teacher: tid })
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

// Majburiyatlar: qoldig'i (expected - paid) > 0 bo'lgan maoshlar.
export const obligations = async ({ groupId, year, month }) => {
  const filter = { year: Number(year), month: Number(month) };
  if (groupId) filter.group = toObjectId(groupId);

  const items = await TeacherSalary.find(filter)
    .populate("teacher", safeTeacherProjection)
    .populate("group", { name: 1 })
    .sort({ createdAt: -1 });

  return items
    .map((s) => ({ ...s.toJSON(), remaining: Math.max(0, s.expectedAmount - s.paidAmount) }))
    .filter((s) => s.remaining > 0);
};
