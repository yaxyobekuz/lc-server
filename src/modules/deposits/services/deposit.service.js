import mongoose from "mongoose";
import StudentDeposit from "../../../models/studentDeposit.model.js";
import DepositTransaction from "../../../models/depositTransaction.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as studentPaymentService from "../../finance/services/studentPayment.service.js";

const safeStudentProjection = { firstName: 1, lastName: 1, username: 1, phone: 1 };

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const ensureStudent = async (studentId) => {
  const student = await User.findOne({
    _id: studentId,
    role: ROLES.STUDENT,
    isDeleted: { $ne: true },
  });
  if (!student) throw new ApiError(400, "O'quvchi topilmadi");
  return student;
};

// O'quvchining depozit hisobi (yo'q bo'lsa yaratiladi).
// session berilsa, ochiq MongoDB tranzaksiyasi ichida o'qib-yozadi.
export const getOrCreate = async (student, { session } = {}) => {
  const sid = toObjectId(student);
  const existing = await StudentDeposit.findOne({ student: sid }).session(session || null);
  if (existing) return existing;
  try {
    const docs = await StudentDeposit.create([{ student: sid, balance: 0 }], {
      session: session || undefined,
    });
    return docs[0];
  } catch (err) {
    if (err?.code === 11000) {
      return StudentDeposit.findOne({ student: sid }).session(session || null);
    }
    throw err;
  }
};

export const balanceFor = async (student) => {
  const dep = await StudentDeposit.findOne({ student: toObjectId(student) });
  return dep?.balance || 0;
};

// Balansni atomik o'zgartiradi. delta<0 (yechish) bo'lsa balance yetarli bo'lishi
// shart - aks holda hujjat yangilanmaydi (null) → chaqiruvchi xato beradi.
// session berilsa, ochiq MongoDB tranzaksiyasi ichida yoziladi.
const applyBalanceDelta = async (depositId, delta, { session } = {}) => {
  const filter = { _id: depositId };
  if (delta < 0) filter.balance = { $gte: -delta };
  return StudentDeposit.findOneAndUpdate(
    filter,
    { $inc: { balance: delta } },
    { new: true, session: session || undefined },
  );
};

// --- DEPOZIT QO'SHISH / YECHISH ---

export const topup = async (studentId, { amount, method, paidAt, note }, currentUser) => {
  await ensureStudent(studentId);
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new ApiError(400, "Summa noto'g'ri");
  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri sana");
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Sana kelajakda bo'lishi mumkin emas");
  }

  const deposit = await getOrCreate(studentId);
  const updated = await applyBalanceDelta(deposit._id, amt);
  await DepositTransaction.create({
    student: deposit.student,
    deposit: deposit._id,
    type: "topup",
    amount: amt,
    method: method || "cash",
    balanceAfter: updated.balance,
    note: note || "",
    paidAt: day,
    createdBy: currentUser?._id || null,
  });

  // Pul qo'yilishi bilan mavjud qarzlarni darhol qoplaymiz (eng eskisidan).
  await autoApply(studentId);
  return getOrCreate(studentId);
};

export const withdraw = async (studentId, { amount, method, paidAt, note }, currentUser) => {
  await ensureStudent(studentId);
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new ApiError(400, "Summa noto'g'ri");
  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri sana");
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Sana kelajakda bo'lishi mumkin emas");
  }

  const deposit = await getOrCreate(studentId);
  const updated = await applyBalanceDelta(deposit._id, -amt);
  if (!updated) {
    throw new ApiError(400, `Depozitda yetarli mablag' yo'q (balans: ${deposit.balance} so'm)`);
  }
  await DepositTransaction.create({
    student: deposit.student,
    deposit: deposit._id,
    type: "withdraw",
    amount: amt,
    method: method || "cash",
    balanceAfter: updated.balance,
    note: note || "",
    paidAt: day,
    createdBy: currentUser?._id || null,
  });
  return getOrCreate(studentId);
};

// --- QOPLAMA (depozit → oylik plan) ---

// Bitta planga depozitdan `amount` qoplaydi: plan.paidAmount += (cap qoldiqqacha) +
// balans -= + PaymentTransaction(source:"deposit", DAROMAD). Haqiqatda qo'llangan
// summani qaytaradi (cap tufayli kamroq bo'lishi mumkin).
const applyToPayment = async (deposit, payment, amount, currentUser) => {
  const remaining = Math.max(0, (payment.expectedAmount || 0) - (payment.paidAmount || 0));
  const amt = Math.min(amount, remaining);
  if (amt <= 0) return 0;

  // Avval balansni atomik kamaytiramiz (yetmasa null).
  const balUpd = await applyBalanceDelta(deposit._id, -amt);
  if (!balUpd) return 0;

  // Planga qo'llaymiz (cap qoldiqqacha). Agar muvaffaqiyatsiz bo'lsa balansni qaytaramiz.
  const planUpd = await studentPaymentService.applyPaidDelta(payment._id, amt, {
    capToRemaining: true,
  });
  if (!planUpd) {
    await applyBalanceDelta(deposit._id, amt); // rollback
    return 0;
  }

  try {
    await PaymentTransaction.create({
      payment: payment._id,
      student: payment.student,
      group: payment.group,
      year: payment.year,
      month: payment.month,
      amount: amt,
      source: "deposit",
      method: "cash",
      paidAt: localTodayMidnight(),
      note: "Depozitdan qoplandi",
      createdBy: currentUser?._id || null,
    });
  } catch (err) {
    // Tranzaksiya yozilmasa - plan va balansni qaytaramiz.
    await studentPaymentService.applyPaidDelta(payment._id, -amt);
    await applyBalanceDelta(deposit._id, amt);
    throw err;
  }
  return amt;
};

// O'quvchi depozitidan barcha qoldiq planlarni ENG ESKISIDAN boshlab qoplaydi.
export const autoApply = async (studentId, currentUser) => {
  const deposit = await getOrCreate(studentId);
  if ((deposit.balance || 0) <= 0) return { applied: 0 };

  // Qoldiq (expected>paid) planlar, eng eski oy avval.
  const plans = await StudentPayment.find({
    student: deposit.student,
    isDeleted: { $ne: true },
    $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
  }).sort({ year: 1, month: 1, createdAt: 1 });

  let applied = 0;
  for (const plan of plans) {
    const fresh = await StudentDeposit.findById(deposit._id);
    if ((fresh?.balance || 0) <= 0) break;
    const used = await applyToPayment(fresh, plan, fresh.balance, currentUser);
    applied += used;
  }
  return { applied };
};

// Berilgan oyda plani bor + depoziti bor o'quvchilarga autoApply (oylik job hook).
export const autoApplyForMonth = async (year, month) => {
  const studentIds = await StudentPayment.distinct("student", {
    year,
    month,
    isDeleted: { $ne: true },
    $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
  });
  let applied = 0;
  for (const sid of studentIds) {
    try {
      const r = await autoApply(sid);
      applied += r.applied;
    } catch (err) {
      logger.warn({ err, student: sid }, "Depozit avto-qoplash xatosi");
    }
  }
  return { students: studentIds.length, applied };
};

// Bir refund yozuvi: plan.paidAmount -= take, balans += take, refund ledger yozuvi.
const refundOverpayChunk = async (deposit, planId, take, note) => {
  await studentPaymentService.applyPaidDelta(planId, -take);
  const balUpd = await applyBalanceDelta(deposit._id, take);
  if (!balUpd) throw new ApiError(500, "Depozitga qaytarib bo'lmadi");
  await DepositTransaction.create({
    student: deposit.student,
    deposit: deposit._id,
    type: "refund",
    amount: take,
    balanceAfter: balUpd.balance,
    note,
    paidAt: localTodayMidnight(),
  });
};

// Plan kamayganda (expected<paid) ortiqcha to'lovni depozitga qaytaradi.
// recalc'dan KEYIN best-effort chaqiriladi (atomik pipeline'dan tashqarida).
// Avval DEPOZIT-qoplama tranzaksiyalari (faqat kerakli ulush - qisman reverse,
// fantom pul yaratmaymiz), yetmasa qolgan ortiqcha to'g'ridan-to'g'ri to'lov ham
// depozitga qaytadi (memory qoidasi: "overpay depozitga qaytadi").
export const reconcileDepositOverpay = async (paymentId) => {
  const plan = await StudentPayment.findById(paymentId);
  if (!plan) return;
  let excess = (plan.paidAmount || 0) - (plan.expectedAmount || 0);
  if (excess <= 0) return;

  const deposit = await getOrCreate(plan.student);
  let reversed = 0;

  // 1) Depozit-qoplama tranzaksiyalarini qisman reverse qilamiz (eng yangidan).
  const depositTxns = await PaymentTransaction.find({
    payment: plan._id,
    source: "deposit",
    isDeleted: { $ne: true },
  }).sort({ createdAt: -1 });

  for (const txn of depositTxns) {
    if (reversed >= excess) break;
    const take = Math.min(txn.amount, excess - reversed);
    if (take >= txn.amount) {
      // Butun tranzaksiya - o'chiramiz.
      txn.isDeleted = true;
      txn.deletedAt = new Date();
      await txn.save();
    } else {
      // Qisman - faqat ortiqcha ulushni yechamiz, qolgani qoplama bo'lib qoladi.
      txn.amount -= take;
      await txn.save();
    }
    await refundOverpayChunk(
      deposit,
      plan._id,
      take,
      "Oylik to'lov kamayishi - depozitga qaytarildi",
    );
    reversed += take;
  }

  // 2) Qolgan ortiqcha to'g'ridan-to'g'ri (cash) to'lov - uni ham depozitga qaytaramiz.
  const directExcess = excess - reversed;
  if (directExcess > 0) {
    await refundOverpayChunk(
      deposit,
      plan._id,
      directExcess,
      "Ortiqcha to'lov - depozitga qaytarildi",
    );
  }
};

// Depozit-qoplama PaymentTransaction o'chirilganda pul NAQDGA emas, DEPOZITGA
// qaytadi (transaction.service.remove chaqiradi). Balans += + refund yozuvi.
// session berilsa, qoplamani bekor qilgan MongoDB tranzaksiyasi ichida atomik
// bajariladi - aks holda tashqi abort/retry'da depozit ikki marta kreditlanardi.
export const refundToDeposit = async (
  studentId,
  amount,
  { session, note } = {},
) => {
  const deposit = await getOrCreate(studentId, { session });
  const upd = await applyBalanceDelta(deposit._id, amount, { session });
  if (!upd) throw new ApiError(500, "Depozitga qaytarib bo'lmadi");
  await DepositTransaction.create(
    [
      {
        student: deposit.student,
        deposit: deposit._id,
        type: "refund",
        amount,
        balanceAfter: upd.balance,
        note: note || "To'lov bekor qilindi - depozitga qaytarildi",
        paidAt: localTodayMidnight(),
      },
    ],
    { session: session || undefined },
  );
};

// --- DEPOZIT TRANZAKSIYASINI BEKOR QILISH (topup/withdraw) ---

export const removeDepositTxn = async (id, currentUser) => {
  const txn = await DepositTransaction.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!txn) throw new ApiError(404, "Tranzaksiya topilmadi");
  if (txn.type === "refund") {
    throw new ApiError(400, "Qaytarim tranzaksiyasini o'chirib bo'lmaydi");
  }

  const deposit = await getOrCreate(txn.student);
  if (txn.type === "topup") {
    // Pul kelmagan deb hisoblaymiz - balansdan ayiramiz (agar qoplanmagan bo'lsa).
    const balUpd = await applyBalanceDelta(deposit._id, -txn.amount);
    if (!balUpd) {
      throw new ApiError(400, "Bu pul allaqachon qoplangan - tranzaksiyani o'chirib bo'lmaydi");
    }
  } else {
    // withdraw bekor - pul qaytib keldi.
    await applyBalanceDelta(deposit._id, txn.amount);
  }
  txn.isDeleted = true;
  txn.deletedAt = new Date();
  txn.deletedBy = currentUser?._id || null;
  await txn.save();
  return { _id: txn._id };
};

// --- O'QISH / HISOBOTLAR ---

// O'quvchining depozit summary'si (balans + jami kirim/chiqim/qoplangan).
export const summaryFor = async (studentId) => {
  const sid = toObjectId(studentId);
  const student = await User.findById(sid, safeStudentProjection).lean();
  if (!student) throw new ApiError(404, "O'quvchi topilmadi");
  const deposit = await getOrCreate(sid);

  const [ledger] = await DepositTransaction.aggregate([
    { $match: { student: sid, isDeleted: { $ne: true } } },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
      },
    },
  ]).then((rows) => [Object.fromEntries(rows.map((r) => [r._id, r.total]))]);

  const [appliedAgg] = await PaymentTransaction.aggregate([
    { $match: { student: sid, source: "deposit", isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return {
    student,
    balance: deposit.balance || 0,
    totalTopup: ledger?.topup || 0,
    totalWithdraw: ledger?.withdraw || 0,
    totalRefund: ledger?.refund || 0,
    totalApplied: appliedAgg?.total || 0,
  };
};

// O'quvchi depozit tarixi: ledger (topup/withdraw/refund) + qoplamalar (apply),
// sana bo'yicha birlashtirilgan (eng yangisi yuqorida).
export const historyFor = async (studentId) => {
  const sid = toObjectId(studentId);
  const [ledger, applies] = await Promise.all([
    DepositTransaction.find({ student: sid, isDeleted: { $ne: true } })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean(),
    PaymentTransaction.find({ student: sid, source: "deposit", isDeleted: { $ne: true } })
      .populate("group", { name: 1 })
      .sort({ paidAt: -1, createdAt: -1 })
      .lean(),
  ]);

  const rows = [
    ...ledger.map((t) => ({
      _id: t._id,
      kind: t.type, // topup | withdraw | refund
      amount: t.amount,
      method: t.method,
      paidAt: t.paidAt,
      note: t.note,
      balanceAfter: t.balanceAfter,
      removable: t.type !== "refund",
    })),
    ...applies.map((t) => ({
      _id: t._id,
      kind: "apply", // depozit → oylik to'lov (daromad)
      amount: t.amount,
      paidAt: t.paidAt,
      group: t.group,
      year: t.year,
      month: t.month,
      note: t.note,
      removable: false,
    })),
  ].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  return rows;
};

// Owner sahifa tab1: depozit tranzaksiyalari ro'yxati (barcha o'quvchilar, filtrli).
export const list = async ({ studentId, from, to, type, page = 1, limit = 50 }) => {
  const filter = { isDeleted: { $ne: true } };
  if (studentId) filter.student = toObjectId(studentId);
  if (type) filter.type = type;
  if (from || to) {
    filter.paidAt = {};
    if (from) filter.paidAt.$gte = parseLocalDay(from);
    if (to) filter.paidAt.$lte = parseLocalDay(to);
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    DepositTransaction.find(filter)
      .populate("student", safeStudentProjection)
      .sort({ paidAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DepositTransaction.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

// Owner sahifa tab2: hisobotlar. Jami ushlangan balans + davr bo'yicha kirim/chiqim/
// qoplangan + per-o'quvchi balanslar (balans>0).
export const report = async ({ from, to } = {}) => {
  const range = {};
  if (from || to) {
    range.paidAt = {};
    if (from) range.paidAt.$gte = parseLocalDay(from);
    if (to) range.paidAt.$lte = parseLocalDay(to);
  }

  const [ledgerRows, appliedAgg, balances] = await Promise.all([
    DepositTransaction.aggregate([
      { $match: { isDeleted: { $ne: true }, ...range } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]),
    PaymentTransaction.aggregate([
      { $match: { source: "deposit", isDeleted: { $ne: true }, ...range } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    StudentDeposit.find({ balance: { $gt: 0 } })
      .populate("student", safeStudentProjection)
      .sort({ balance: -1 })
      .lean(),
  ]);

  const ledger = Object.fromEntries(ledgerRows.map((r) => [r._id, r.total]));
  const heldTotal = balances.reduce((s, d) => s + (d.balance || 0), 0);

  return {
    heldTotal,
    totalTopup: ledger.topup || 0,
    totalWithdraw: ledger.withdraw || 0,
    totalRefund: ledger.refund || 0,
    totalApplied: appliedAgg[0]?.total || 0,
    balances: balances.map((d) => ({ student: d.student, balance: d.balance })),
  };
};
