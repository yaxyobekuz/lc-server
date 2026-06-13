import mongoose from "mongoose";
import Refund from "../../../models/refund.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import BotUser from "../../../models/botUser.model.js";
import ApiError from "../../../utils/ApiError.js";

const safeStudentProjection = {
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

// Berilgan user obyektlariga bog'langan Telegram ma'lumotini (telegramId, username)
// bitta so'rovda biriktiradi. Bog'lanmagan bo'lsa telegram: null bo'ladi.
const attachTelegram = async (userObjs) => {
  const ids = userObjs.map((u) => u?._id).filter(Boolean);
  if (!ids.length) return;
  const bots = await BotUser.find(
    { user: { $in: ids } },
    { user: 1, telegramId: 1, username: 1 },
  ).lean();
  const byUser = new Map(
    bots.map((b) => [
      String(b.user),
      { telegramId: b.telegramId, username: b.username || null },
    ]),
  );
  for (const u of userObjs) {
    u.telegram = byUser.get(String(u._id)) || null;
  }
};

// O'quvchi+guruh juftliklari ichidan guruhdan KETGANLARINI aniqlaydi.
// Ketgan = shu juftlik uchun faol (leftAt:null) a'zolik YO'Q. Rejoin holatida
// o'quvchi qayta faol bo'lsa - hali ketmagan deb hisoblanadi (refund bermaymiz,
// ortiqcha pul avans bo'lib qoladi). Faol juftliklar Set sifatida qaytadi.
const loadActivePairs = async (pairs) => {
  if (!pairs.length) return new Set();
  const orFilters = pairs.map((p) => ({ student: p.student, group: p.group }));
  const active = await GroupMembership.find(
    {
      $or: orFilters,
      leftAt: null,
      isDeleted: { $ne: true },
    },
    { student: 1, group: 1 },
  ).lean();
  return new Set(active.map((m) => `${m.student}:${m.group}`));
};

// Surplus (qaytarilishi kerak) bo'lgan to'lovlar ro'yxati: paidAmount > expectedAmount
// VA o'quvchi shu guruhdan ketgan VA hali refund qilinmagan. Har bir yozuvga
// o'quvchi (number/username) + telegram ma'lumoti biriktiriladi.
export const listPending = async ({ search, page = 1, limit = 50 } = {}) => {
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(200, Math.max(1, Number(limit) || 50));

  // 1) Ortiqcha to'langan barcha to'lovlar (paidAmount > expectedAmount).
  //    Snapshot maydonlar bilan solishtiramiz - $expr orqali maydonlararo.
  const surplus = await StudentPayment.find({
    isDeleted: { $ne: true },
    $expr: { $gt: ["$paidAmount", "$expectedAmount"] },
  })
    .populate("student", safeStudentProjection)
    .populate("group", { name: 1 })
    .lean();

  if (!surplus.length) {
    return { items: [], total: 0, page, limit };
  }

  // 2) Allaqachon refund qilinganlarni chiqarib tashlaymiz.
  const refunded = await Refund.find(
    { payment: { $in: surplus.map((p) => p._id) } },
    { payment: 1 },
  ).lean();
  const refundedSet = new Set(refunded.map((r) => String(r.payment)));

  // 3) O'quvchi guruhdan ketganmi - faqat ketganlar refundga loyiq.
  const candidates = surplus.filter((p) => !refundedSet.has(String(p._id)));
  const activePairs = await loadActivePairs(
    candidates.map((p) => ({
      student: p.student?._id || p.student,
      group: p.group?._id || p.group,
    })),
  );

  let items = candidates
    .filter((p) => {
      const sid = p.student?._id || p.student;
      const gid = p.group?._id || p.group;
      return !activePairs.has(`${sid}:${gid}`);
    })
    .map((p) => ({
      _id: p._id,
      student: p.student,
      group: p.group,
      year: p.year,
      month: p.month,
      expectedAmount: p.expectedAmount || 0,
      paidAmount: p.paidAmount || 0,
      refundable: Math.max(0, (p.paidAmount || 0) - (p.expectedAmount || 0)),
    }))
    .filter((p) => p.refundable > 0);

  // Ism/telefon/username bo'yicha qidiruv (yuklangan o'quvchi ustida).
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    items = items.filter((p) => {
      const st = p.student || {};
      const hay = [st.firstName, st.lastName, st.username, st.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }

  // Eng katta qaytariladigan summa yuqorida.
  items.sort((a, b) => b.refundable - a.refundable);

  const total = items.length;
  const start = (page - 1) * limit;
  const pageItems = items.slice(start, start + limit);
  await attachTelegram(pageItems.map((p) => p.student).filter(Boolean));

  return { items: pageItems, total, page, limit };
};

// Joriy (qaytarilishi kerak) summa va o'quvchi ketganligini tekshirib, refund
// yozuvini yaratadi - "shu pul o'quvchiga qaytarib berildi" deb belgilanadi.
// payment dagi unique index takror qaytarishni to'sadi.
export const create = async ({ paymentId, note }, currentUser) => {
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  const refundable = Math.max(
    0,
    (payment.paidAmount || 0) - (payment.expectedAmount || 0),
  );
  if (refundable <= 0) {
    throw new ApiError(400, "Bu to'lovda qaytariladigan ortiqcha summa yo'q");
  }

  // O'quvchi shu guruhda hali faol bo'lsa - ortiqcha pul avans, qaytarilmaydi.
  const active = await GroupMembership.findOne({
    student: payment.student,
    group: payment.group,
    leftAt: null,
    isDeleted: { $ne: true },
  });
  if (active) {
    throw new ApiError(
      400,
      "O'quvchi guruhda faol - ortiqcha summa avans hisobiga yoziladi, qaytarilmaydi",
    );
  }

  try {
    return await Refund.create({
      payment: payment._id,
      student: payment.student,
      group: payment.group,
      year: payment.year,
      month: payment.month,
      amount: refundable,
      note: note || "",
      refundedBy: currentUser?._id || null,
    });
  } catch (err) {
    // unique(payment) - parallel/takror qaytarish
    if (err?.code === 11000) {
      throw new ApiError(409, "Bu to'lov allaqachon qaytarilgan");
    }
    throw err;
  }
};

// Qaytarilgan refundlar tarixi (ixtiyoriy oy filtri bilan).
export const listHistory = async ({ year, month, page = 1, limit = 50 } = {}) => {
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(200, Math.max(1, Number(limit) || 50));

  const filter = {};
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    Refund.find(filter)
      .populate("student", safeStudentProjection)
      .populate("group", { name: 1 })
      .populate("refundedBy", { firstName: 1, lastName: 1 })
      .sort({ refundedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Refund.countDocuments(filter),
  ]);

  await attachTelegram(rows.map((r) => r.student).filter(Boolean));

  return { items: rows, total, page, limit };
};
