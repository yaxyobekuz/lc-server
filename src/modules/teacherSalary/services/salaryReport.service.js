import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import * as teacherSalaryService from "./teacherSalary.service.js";
import * as systemNotificationsService from "../../systemNotifications/services/systemNotifications.service.js";
import logger from "../../../config/logger.js";

// Tanlangan oy uchun maosh statistikasi (chiqim, majburiyatlar).
export const monthly = async ({ year, month }) => {
  const y = Number(year);
  const m = Number(month);

  const [expenseAgg, salaryAgg, byTeacherPayout, byTeacherObligation, daily, methodAgg] =
    await Promise.all([
      // Umumiy chiqim (faol maosh tranzaksiyalari)
      SalaryTransaction.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // Kutilgan/to'langan/bonus/jarima yig'indilari
      TeacherSalary.aggregate([
        { $match: { year: y, month: m } },
        {
          $group: {
            _id: null,
            expected: { $sum: "$expectedAmount" },
            paid: { $sum: "$paidAmount" },
            bonus: { $sum: "$bonusTotal" },
            fine: { $sum: "$fineTotal" },
            count: { $sum: 1 },
            paidCount: { $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] } },
          },
        },
      ]),
      // O'qituvchilar bo'yicha to'langan (chiqim)
      SalaryTransaction.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        { $group: { _id: "$teacher", payout: { $sum: "$amount" } } },
        {
          $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "teacher" },
        },
        { $unwind: "$teacher" },
        {
          $project: {
            _id: 1,
            payout: 1,
            name: { $concat: ["$teacher.firstName", " ", "$teacher.lastName"] },
          },
        },
        { $sort: { payout: -1 } },
      ]),
      // O'qituvchilar bo'yicha qoldiq (majburiyat)
      TeacherSalary.aggregate([
        { $match: { year: y, month: m } },
        {
          $group: {
            _id: "$teacher",
            obligation: { $sum: { $subtract: ["$expectedAmount", "$paidAmount"] } },
          },
        },
        {
          $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "teacher" },
        },
        { $unwind: "$teacher" },
        {
          $project: {
            _id: 1,
            obligation: 1,
            name: { $concat: ["$teacher.firstName", " ", "$teacher.lastName"] },
          },
        },
        { $sort: { obligation: -1 } },
      ]),
      // Kunlik chiqim
      SalaryTransaction.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt", timezone: "UTC" } },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // To'lov turi bo'yicha (naqd/karta)
      SalaryTransaction.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        { $group: { _id: "$method", total: { $sum: "$amount" } } },
      ]),
    ]);

  const expense = expenseAgg.length ? expenseAgg[0].total : 0;
  const s = salaryAgg.length ? salaryAgg[0] : {};
  const expected = s.expected || 0;
  const paid = s.paid || 0;
  const obligations = Math.max(0, expected - paid);

  const byMethod = { cash: 0, card: 0 };
  for (const row of methodAgg) byMethod[row._id] = row.total;

  return {
    year: y,
    month: m,
    totals: {
      expense,
      obligations,
      expected,
      paid,
      bonusValue: s.bonus || 0,
      fineValue: s.fine || 0,
      salariesCount: s.count || 0,
      paidCount: s.paidCount || 0,
    },
    byMethod,
    dailyExpense: daily.map((d) => ({ date: d._id, total: d.total })),
    teachersByPayout: byTeacherPayout.map((t) => ({
      teacher: t._id,
      name: t.name,
      payout: t.payout,
    })),
    teachersByObligation: byTeacherObligation
      .filter((t) => t.obligation > 0)
      .map((t) => ({ teacher: t._id, name: t.name, obligation: t.obligation })),
  };
};

// Berilgan oy uchun o'qituvchi maoshlarini generatsiya qiladi.
export const regenerate = async (year, month) => {
  const result = await teacherSalaryService.generateMonth(year, month);
  try {
    await systemNotificationsService.create({
      message: `${month}-oy (${year}) uchun o'qituvchi maoshlari generatsiya qilindi`,
      link: "/owner/finance/teacher-salaries",
    });
  } catch (err) {
    logger.warn({ err }, "Maosh generatsiya bildirishnomasi yuborilmadi");
  }
  return result;
};
