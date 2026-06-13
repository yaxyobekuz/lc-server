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

// O'quvchi shu (year, month) OYIDA guruhda a'zo bo'lganmi - ya'ni o'sha oyni
// qamraydigan FAOL (leftAt:null) a'zolik bormi. Rejoin holatida kelajakdagi
// yangi a'zolik o'tgan oyni qamramaydi (joinedAt > oy oxiri), shuning uchun
// o'tgan oydagi refund noto'g'ri bloklanmaydi (#4A).
const isActiveForMonth = async (student, group, year, month) => {
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const m = await GroupMembership.findOne({
    student,
    group,
    leftAt: null,
    isDeleted: { $ne: true },
    joinedAt: { $lte: monthEnd },
  });
  return !!m;
};

// O'quvchi+guruh+oy uchligi ichidan SHU OYDA hali a'zo bo'lganlarini aniqlaydi
// (avans, refund emas). Ketgan/o'sha oyni qamramaydigan a'zolik bo'lgan uchliklar
// refundga loyiq. Faol uchliklar Set (`student:group:year:month`) sifatida qaytadi.
const loadActiveForMonth = async (triples) => {
  if (!triples.length) return new Set();
  const memberships = await GroupMembership.find(
    {
      $or: triples.map((t) => ({ student: t.student, group: t.group })),
      leftAt: null,
      isDeleted: { $ne: true },
    },
    { student: 1, group: 1, joinedAt: 1 },
  ).lean();

  // student:group -> joinedAt (faol a'zolik) xaritasi
  const joinedByPair = new Map();
  for (const m of memberships) {
    joinedByPair.set(`${m.student}:${m.group}`, m.joinedAt);
  }

  const result = new Set();
  for (const t of triples) {
    const joinedAt = joinedByPair.get(`${t.student}:${t.group}`);
    if (!joinedAt) continue; // faol a'zolik yo'q - ketgan, refundga loyiq
    const monthEnd = new Date(Date.UTC(t.year, t.month, 0, 23, 59, 59, 999));
    // Faol a'zolik shu oyni qamrasa (oy oxiridan oldin qo'shilgan) - avans, refund emas.
    if (new Date(joinedAt).getTime() <= monthEnd.getTime()) {
      result.add(`${t.student}:${t.group}:${t.year}:${t.month}`);
    }
  }
  return result;
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

  // 2) Allaqachon refund qilinganlarni chiqarib tashlaymiz (o'chirilmaganlari).
  const refunded = await Refund.find(
    { payment: { $in: surplus.map((p) => p._id) }, isDeleted: { $ne: true } },
    { payment: 1 },
  ).lean();
  const refundedSet = new Set(refunded.map((r) => String(r.payment)));

  // 3) O'quvchi shu OYDA guruhda a'zo emasmi - faqat o'sha oy uchun ketganlar
  //    refundga loyiq (rejoin'da o'tgan oy refundi bloklanmaydi, #4A bilan izchil).
  const candidates = surplus.filter((p) => !refundedSet.has(String(p._id)));
  const activeForMonth = await loadActiveForMonth(
    candidates.map((p) => ({
      student: p.student?._id || p.student,
      group: p.group?._id || p.group,
      year: p.year,
      month: p.month,
    })),
  );

  let items = candidates
    .filter((p) => {
      const sid = p.student?._id || p.student;
      const gid = p.group?._id || p.group;
      return !activeForMonth.has(`${sid}:${gid}:${p.year}:${p.month}`);
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

  // O'quvchi SHU TO'LOV OYIDA hali a'zo bo'lsa - ortiqcha summa avans, qaytarilmaydi.
  // MUHIM: "umuman faol a'zolik bormi" emas, balki "shu oyni qamraydigan a'zolik
  // bormi" ni tekshiramiz (#4A rejoin race). Aks holda o'quvchi o'tgan oy uchun
  // ortiqcha to'lab ketib, KEYIN boshqa oyda qayta qo'shilsa - yangi (kelajak)
  // a'zolik o'tgan oydagi haqli refundni noto'g'ri bloklab, pul "limbo"da qolardi.
  if (await isActiveForMonth(payment.student, payment.group, payment.year, payment.month)) {
    throw new ApiError(
      400,
      "O'quvchi bu oyda guruhda faol - ortiqcha summa avans hisobiga yoziladi, qaytarilmaydi",
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

  const filter = { isDeleted: { $ne: true } };
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
