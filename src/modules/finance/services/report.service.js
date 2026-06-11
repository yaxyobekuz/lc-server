import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import * as groupFeeService from "./groupFee.service.js";
import * as studentPaymentService from "./studentPayment.service.js";
import * as systemNotificationsService from "../../systemNotifications/services/systemNotifications.service.js";
import logger from "../../../config/logger.js";

// Tanlangan oy uchun to'liq statistika.
export const monthly = async ({ year, month }) => {
  const y = Number(year);
  const m = Number(month);

  const [incomeAgg, paymentAgg, byGroupIncome, byGroupDebt, daily, methodAgg] =
    await Promise.all([
      // Umumiy kirim (faol tranzaksiyalar)
      PaymentTransaction.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // Kutilgan/to'langan/chegirma yig'indilari.
      // debt har bir to'lov bo'yicha 0 ga clamp qilinadi - bitta o'quvchining
      // ortiqcha to'lovi boshqasining real qarzini "yutib yubormasligi" uchun.
      StudentPayment.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: null,
            expected: { $sum: "$expectedAmount" },
            paid: { $sum: "$paidAmount" },
            debt: {
              $sum: {
                $max: [0, { $subtract: ["$expectedAmount", "$paidAmount"] }],
              },
            },
            discount: { $sum: "$discountApplied" },
            discountedCount: {
              $sum: { $cond: [{ $gt: ["$discountApplied", 0] }, 1, 0] },
            },
            count: { $sum: 1 },
            paidCount: {
              $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
            },
          },
        },
      ]),
      // Guruhlar bo'yicha kirim
      PaymentTransaction.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        { $group: { _id: "$group", income: { $sum: "$amount" } } },
        {
          $lookup: {
            from: "groups",
            localField: "_id",
            foreignField: "_id",
            as: "group",
          },
        },
        { $unwind: "$group" },
        { $project: { _id: 1, income: 1, name: "$group.name" } },
        { $sort: { income: -1 } },
      ]),
      // Guruhlar bo'yicha qarzdorlik (har to'lov bo'yicha clamp - ichki netting yo'q)
      StudentPayment.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: "$group",
            debt: {
              $sum: {
                $max: [0, { $subtract: ["$expectedAmount", "$paidAmount"] }],
              },
            },
          },
        },
        {
          $lookup: {
            from: "groups",
            localField: "_id",
            foreignField: "_id",
            as: "group",
          },
        },
        { $unwind: "$group" },
        { $project: { _id: 1, debt: 1, name: "$group.name" } },
        { $sort: { debt: -1 } },
      ]),
      // Kunlik kirim (paidAt bo'yicha)
      PaymentTransaction.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$paidAt", timezone: "UTC" },
            },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // To'lov turi bo'yicha (naqd/karta)
      PaymentTransaction.aggregate([
        { $match: { year: y, month: m, isDeleted: { $ne: true } } },
        { $group: { _id: "$method", total: { $sum: "$amount" } } },
      ]),
    ]);

  const income = incomeAgg.length ? incomeAgg[0].total : 0;
  const p = paymentAgg.length ? paymentAgg[0] : {};
  const expected = p.expected || 0;
  const paid = p.paid || 0;
  // Per-hujjat clamp'langan yig'indi (netto emas - real undirilishi kerak summa)
  const debt = p.debt || 0;

  const byMethod = { cash: 0, card: 0 };
  for (const row of methodAgg) byMethod[row._id] = row.total;

  return {
    year: y,
    month: m,
    totals: {
      income,
      expected,
      paid,
      debt,
      discountValue: p.discount || 0,
      discountedCount: p.discountedCount || 0,
      paymentsCount: p.count || 0,
      paidCount: p.paidCount || 0,
    },
    byMethod,
    dailyIncome: daily.map((d) => ({ date: d._id, total: d.total })),
    groupsByIncome: byGroupIncome.map((g) => ({
      group: g._id,
      name: g.name,
      income: g.income,
    })),
    groupsByDebt: byGroupDebt
      .filter((g) => g.debt > 0)
      .map((g) => ({ group: g._id, name: g.name, debt: g.debt })),
  };
};

// Berilgan oy uchun guruh to'lovlari + o'quvchi to'lovlarini generatsiya qiladi.
export const regenerate = async (year, month) => {
  const feeResult = await groupFeeService.generateMonth(year, month);
  const paymentResult = await studentPaymentService.generateMonth(year, month);

  try {
    await systemNotificationsService.create({
      message: `${month}-oy (${year}) uchun oylik to'lovlar generatsiya qilindi`,
      link: "/owner/finance/student-payments",
    });
  } catch (err) {
    logger.warn({ err }, "Moliya generatsiya bildirishnomasi yuborilmadi");
  }

  return { fees: feeResult, payments: paymentResult };
};
