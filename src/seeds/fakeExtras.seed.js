import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import { ROLES } from "../constants/roles.js";
import {
  dateKeyOf,
  getClassDaysInRange,
} from "../helpers/attendance.helper.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import Feedback from "../models/feedback.model.js";
import NotificationTemplate from "../models/notificationTemplate.model.js";
import Notification from "../models/notification.model.js";
import NotificationRecipient from "../models/notificationRecipient.model.js";
import TeacherAbsence from "../models/teacherAbsence.model.js";
import BotUser from "../models/botUser.model.js";

// Mavjud fake datani (fakeData.seed) to'ldiruvchi: bo'sh qolgan kolleksiyalar uchun
// realistik data - notifications, notificationrecipients, teacherabsences, botusers.
// Mavjud user/guruh/invoice'larga bog'lanadi, ularni o'zgartirmaydi.

const NOW = new Date();
const YEAR_AGO = new Date(Date.UTC(2025, 4, 26));

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDate = (from, to) =>
  new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));
const chance = (p) => Math.random() < p;
const weighted = (items) => {
  const total = items.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const w of items) {
    r -= w.weight;
    if (r <= 0) return w.value;
  }
  return items[items.length - 1].value;
};
const sample = (arr, n) => {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, Math.min(n, c.length));
};
const clampDate = (d) => (d.getTime() > NOW.getTime() ? new Date(NOW) : d);
const addMinutes = (d, m) => new Date(d.getTime() + m * 60000);

const bulkInsert = async (Model, docs, chunkSize = 1000) => {
  const inserted = [];
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = await Model.insertMany(docs.slice(i, i + chunkSize), {
      ordered: false,
    });
    inserted.push(...chunk);
  }
  return inserted;
};

const FIRST_NAMES = [
  "Ali", "Bekzod", "Doniyor", "Sardor", "Jasur", "Otabek", "Aziza", "Madina",
  "Nodira", "Zarina", "Mohinur", "Nilufar", "Sevara", "Asal", "Charos",
];
const LAST_NAMES = [
  "Karimov", "Olimov", "Yusupov", "Ergashev", "Mahmudov", "Rahmonov",
  "Sharipov", "Qodirov", "Mirzayev", "Abdullayev", "Nazarov", "Umarov",
];

const ANNOUNCE_BODIES = [
  "Hurmatli o'quvchilar! Bu hafta dam olish kunlarida o'quv markaz ishlamaydi.",
  "Yangi o'quv yili uchun guruhlarga yozilish boshlandi. Administratorga murojaat qiling.",
  "Diqqat! Ertangi darslar jadval bo'yicha o'tkaziladi.",
  "Markazimizda yangi imtihon tizimi joriy etildi. Batafsil ma'lumot uchun murojaat qiling.",
  "Hurmatli o'quvchilar, oylik to'lovlarni o'z vaqtida amalga oshirishingizni so'raymiz.",
];
const ANNOUNCE_TEACHER_BODIES = [
  "Hurmatli o'qituvchilar! Ertaga soat 10:00 da umumiy yig'ilish bo'ladi.",
  "Davomat hisobotlarini har hafta yakshanbagacha to'ldirib qo'ying.",
  "Yangi o'quv metodikasi bo'yicha trening shu hafta o'tkaziladi.",
];
const HOLIDAY_BODIES = [
  "Mustaqillik bayrami bilan tabriklaymiz! Bayram kunlari dam oling.",
  "Navro'z muborak bo'lsin! Bahor bayrami bilan tabriklaymiz.",
  "Yangi yil bilan! Sizga sog'lik va omad tilaymiz.",
  "Hayit muborak! Bayramingiz qutlug' bo'lsin.",
];
const PAYMENT_BODIES = [
  "Eslatma: joriy oy uchun to'lov muddati yaqinlashmoqda.",
  "Hurmatli o'quvchi, oylik to'lovingizni amalga oshirishni unutmang.",
  "To'lov muddati 3 kundan keyin tugaydi. Iltimos, to'lovni amalga oshiring.",
];
const DEBT_BODIES = [
  "Diqqat! Sizda to'lanmagan qarz mavjud. Iltimos, administratorga murojaat qiling.",
  "Qarzdorlik to'g'risida eslatma: to'lovni tezroq amalga oshirishingizni so'raymiz.",
  "Hisobingizda qarzdorlik bor. Darslarni davom ettirish uchun to'lovni yopishingiz kerak.",
];
const CLASSCANCEL_BODIES = [
  "Bugungi dars o'qituvchining sababli kelmaganligi tufayli bekor qilindi.",
  "Diqqat! Ertangi dars boshqa kunga ko'chirildi.",
  "Texnik sabablarga ko'ra bugungi dars o'tkazilmaydi. Uzr so'raymiz.",
];
const TEACHERMSG_BODIES = [
  "Salom! Ertangi darsga uy vazifasini tayyorlab keling.",
  "Bugungi dars materiallarini takrorlashni unutmang.",
  "Keyingi haftada test bo'ladi, tayyorgarlik ko'ring.",
  "Darsga kechikmasdan keling, iltimos.",
];
const ADMINPERSONAL_BODIES = [
  "Hurmatli o'quvchi, administrator siz bilan bog'lanmoqchi. Iltimos, murojaat qiling.",
  "Shaxsiy ma'lumotlaringizni yangilashingiz kerak. Administratorga murojaat qiling.",
  "Sizning arizangiz ko'rib chiqildi. Batafsil ma'lumot uchun bog'laning.",
];
const FEEDBACK_BODIES = [
  "Sizning murojaatingiz ko'rib chiqildi va hal qilindi. Rahmat!",
  "Fikr-mulohazangiz uchun rahmat. Murojaatingiz bo'yicha chora ko'rildi.",
  "Murojaatingiz ko'rib chiqildi. Savollaringiz bo'lsa, bog'laning.",
];
const OTHER_BODIES = [
  "Markazimiz ish vaqti o'zgardi: 09:00 dan 20:00 gacha.",
  "Yangi filial ochildi! Manzil bo'yicha ma'lumot oling.",
  "Tabriklaymiz! Siz oyning faol o'quvchisi bo'ldingiz.",
];

const seed = async () => {
  await connectDB();
  const startedAt = Date.now();

  // Idempotent: faqat shu 4 ta (fake) kolleksiya tozalanadi
  await Promise.all([
    BotUser.deleteMany({}),
    Notification.deleteMany({}),
    NotificationRecipient.deleteMany({}),
    TeacherAbsence.deleteMany({}),
  ]);

  const owner = await User.findOne({ role: ROLES.OWNER }).lean();
  const teachers = await User.find({ role: ROLES.TEACHER }).lean();
  const students = await User.find({ role: ROLES.STUDENT }).lean();
  const groups = await Group.find({}).lean();
  const templates = await NotificationTemplate.find({ isActive: true }).lean();

  const activeStudents = students.filter((s) => s.isActive !== false);
  const teacherIds = teachers.map((t) => t._id);
  const activeStudentIds = activeStudents.map((s) => s._id);

  // ---------- BOT USERS ----------
  // telegramId - qat'iy o'suvchi (unique kafolati), 100M..2.1B oralig'ida
  let tg = 100_000_000 + randInt(0, 50_000_000);
  const nextTg = () => {
    tg += randInt(50, 4000);
    return tg;
  };
  const langOf = () =>
    weighted([
      { value: "uz", weight: 70 },
      { value: "ru", weight: 20 },
      { value: "en", weight: 10 },
    ]);
  const lastSeenOf = () =>
    weighted([
      { value: () => randDate(addMinutes(NOW, -7 * 24 * 60), NOW), weight: 40 },
      { value: () => randDate(addMinutes(NOW, -30 * 24 * 60), NOW), weight: 30 },
      { value: () => randDate(YEAR_AGO, NOW), weight: 30 },
    ])();
  const flowStateOf = () => {
    if (!chance(0.07)) return null;
    return {
      type: "feedback",
      step: weighted([
        { value: "awaiting_type", weight: 40 },
        { value: "awaiting_message", weight: 40 },
        { value: "awaiting_anonymity", weight: 20 },
      ]),
      data: {},
      expiresAt: addMinutes(NOW, randInt(5, 30)),
    };
  };

  // user maydoni unique+sparse: bog'lanmaganlar uchun maydon UMUMAN tushiriladi
  // (null bersak sparse ishlamaydi). Shuning uchun native driver bilan kiritamiz -
  // Mongoose default:null ni qo'shmasligi va createdAt ni orqaga sanash uchun.
  const linkedUserIdSet = new Set();
  const botDocs = [];
  const makeLinkedBot = (u) => {
    const id = nextTg();
    const lastSeen = lastSeenOf();
    botDocs.push({
      telegramId: id,
      chatId: id,
      username: chance(0.6) ? String(u.username).toLowerCase() : null,
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      languageCode: langOf(),
      isBot: false,
      isBlocked: chance(0.04),
      user: u._id,
      flowState: flowStateOf(),
      lastSeenAt: lastSeen,
      createdAt: randDate(YEAR_AGO, lastSeen),
      updatedAt: lastSeen,
    });
    linkedUserIdSet.add(String(u._id));
  };

  for (const s of sample(students, Math.round(students.length * 0.7))) makeLinkedBot(s);
  for (const t of sample(teachers, Math.round(teachers.length * 0.75))) makeLinkedBot(t);

  // Bog'lanmagan (bot topgan, lekin akkaunt yo'q) ~15 ta - user maydoni yo'q
  for (let i = 0; i < 15; i++) {
    const id = nextTg();
    const lastSeen = randDate(YEAR_AGO, addMinutes(NOW, -14 * 24 * 60));
    botDocs.push({
      telegramId: id,
      chatId: id,
      username: chance(0.4) ? `tg_user_${id}` : null,
      firstName: pick(FIRST_NAMES),
      lastName: pick(LAST_NAMES),
      languageCode: langOf(),
      isBot: false,
      isBlocked: chance(0.08),
      flowState: null,
      lastSeenAt: lastSeen,
      createdAt: randDate(YEAR_AGO, lastSeen),
      updatedAt: lastSeen,
    });
  }
  await BotUser.collection.insertMany(botDocs, { ordered: false });
  logger.info(`${botDocs.length} ta bot user yaratildi (${linkedUserIdSet.size} bog'langan)`);

  // ---------- NOTIFICATIONS ----------
  // Faol guruh a'zolari (leftAt=null) - guruh -> studentId[]
  const activeMemberships = await GroupMembership.find({ leftAt: null })
    .select("group student")
    .lean();
  const groupMembers = new Map();
  for (const m of activeMemberships) {
    const g = String(m.group);
    if (!groupMembers.has(g)) groupMembers.set(g, []);
    groupMembers.get(g).push(m.student);
  }
  const teacherToGroups = new Map();
  for (const g of groups) {
    for (const t of g.teachers || []) {
      const k = String(t);
      if (!teacherToGroups.has(k)) teacherToGroups.set(k, []);
      teacherToGroups.get(k).push(g);
    }
  }

  const plans = [];
  const pushNotif = (p) => plans.push(p);
  const resolveRecipients = (aud) => {
    const set = new Map();
    const add = (id) => id && set.set(String(id), id);
    if (aud.type === "all_students") activeStudentIds.forEach(add);
    else if (aud.type === "all_teachers") teacherIds.forEach(add);
    else if (aud.type === "groups")
      (aud.groupIds || []).forEach((g) =>
        (groupMembers.get(String(g)) || []).forEach(add),
      );
    else (aud.userIds || []).forEach(add);
    return [...set.values()];
  };

  // announcement -> barcha o'quvchilar
  for (let i = 0; i < 8; i++)
    pushNotif({
      sender: chance(0.5) ? owner._id : null,
      senderRole: chance(0.5) ? "owner" : "system",
      body: pick(ANNOUNCE_BODIES),
      category: "announcement",
      audience: { type: "all_students" },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  // announcement -> barcha o'qituvchilar
  for (let i = 0; i < 5; i++)
    pushNotif({
      sender: owner._id,
      senderRole: "owner",
      body: pick(ANNOUNCE_TEACHER_BODIES),
      category: "announcement",
      audience: { type: "all_teachers" },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  // holiday -> barcha o'quvchilar
  for (let i = 0; i < 5; i++)
    pushNotif({
      sender: null,
      senderRole: "system",
      title: "Bayram",
      body: pick(HOLIDAY_BODIES),
      category: "holiday",
      audience: { type: "all_students" },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  // payment_reminder -> students batch (auto/system)
  for (let i = 0; i < 30; i++)
    pushNotif({
      sender: null,
      senderRole: "system",
      body: pick(PAYMENT_BODIES),
      category: "payment_reminder",
      isAuto: true,
      audience: { type: "users", userIds: sample(activeStudentIds, randInt(15, 30)) },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  // debt_warning -> students batch (auto/system)
  for (let i = 0; i < 20; i++)
    pushNotif({
      sender: null,
      senderRole: "system",
      body: pick(DEBT_BODIES),
      category: "debt_warning",
      isAuto: true,
      audience: { type: "users", userIds: sample(activeStudentIds, randInt(10, 20)) },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  // class_cancel -> bitta guruh
  for (let i = 0; i < 20; i++) {
    const g = pick(groups);
    const teacher = g.teachers?.[0] || null;
    const fromTeacher = teacher && chance(0.7);
    pushNotif({
      sender: fromTeacher ? teacher : owner._id,
      senderRole: fromTeacher ? "teacher" : "owner",
      body: pick(CLASSCANCEL_BODIES),
      category: "class_cancel",
      audience: { type: "groups", groupIds: [g._id] },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  }
  // teacher_message -> o'qituvchi o'z guruhiga
  const teachersWithGroups = [...teacherToGroups.keys()];
  for (let i = 0; i < 25 && teachersWithGroups.length; i++) {
    const tid = pick(teachersWithGroups);
    const g = pick(teacherToGroups.get(tid));
    pushNotif({
      sender: g.teachers[0],
      senderRole: "teacher",
      body: pick(TEACHERMSG_BODIES),
      category: "teacher_message",
      audience: { type: "groups", groupIds: [g._id] },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  }
  // admin_personal -> bitta o'quvchi
  for (let i = 0; i < 15; i++)
    pushNotif({
      sender: owner._id,
      senderRole: "owner",
      body: pick(ADMINPERSONAL_BODIES),
      category: "admin_personal",
      audience: { type: "individual", userIds: [pick(activeStudentIds)] },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  // template_based -> shablon asosida
  for (let i = 0; i < 40 && templates.length; i++) {
    const tpl = pick(templates);
    pushNotif({
      sender: owner._id,
      senderRole: "owner",
      body: tpl.body,
      category: "template_based",
      template: tpl._id,
      audience: { type: "users", userIds: sample(activeStudentIds, randInt(10, 30)) },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  }
  // feedback_status -> feedback muallifiga (auto)
  const feedbacks = await Feedback.find({
    author: { $ne: null },
    isAnonymous: false,
  })
    .select("author")
    .limit(10)
    .lean();
  for (const fb of feedbacks)
    pushNotif({
      sender: owner._id,
      senderRole: "owner",
      body: pick(FEEDBACK_BODIES),
      category: "feedback_status",
      isAuto: true,
      relatedFeedback: fb._id,
      audience: { type: "feedback_author", userIds: [fb.author] },
      sentAt: randDate(YEAR_AGO, NOW),
    });
  // other
  for (let i = 0; i < 12; i++)
    pushNotif({
      sender: null,
      senderRole: "system",
      body: pick(OTHER_BODIES),
      category: "other",
      audience: { type: "users", userIds: sample(activeStudentIds, randInt(5, 15)) },
      sentAt: randDate(YEAR_AGO, NOW),
    });

  // Har bir notif uchun: recipients + read/bot-delivery qarorlari
  const notifDocs = [];
  const decisionsPerNotif = [];
  const fullSpan = NOW.getTime() - YEAR_AGO.getTime();
  for (const p of plans) {
    const recipientIds = resolveRecipients(p.audience);
    const ageFrac = (NOW.getTime() - p.sentAt.getTime()) / fullSpan;
    const readProb = 0.35 + 0.5 * Math.max(0, Math.min(1, ageFrac));
    const decisions = [];
    let readCount = 0;
    let deliveredViaBot = 0;
    for (const uid of recipientIds) {
      const hasBot = linkedUserIdSet.has(String(uid));
      let botDeliveredAt = null;
      let botFailedReason = "";
      if (hasBot && chance(0.88)) {
        botDeliveredAt = clampDate(addMinutes(p.sentAt, randInt(0, 180)));
        deliveredViaBot += 1;
      } else if (!hasBot && chance(0.3)) {
        botFailedReason = "Bot hisobi ulanmagan";
      }
      let readAt = null;
      if (chance(readProb)) {
        readAt = clampDate(addMinutes(p.sentAt, randInt(30, 7 * 24 * 60)));
        readCount += 1;
      }
      decisions.push({ user: uid, readAt, botDeliveredAt, botFailedReason });
    }
    decisionsPerNotif.push(decisions);
    notifDocs.push({
      sender: p.sender ?? null,
      senderRole: p.senderRole || "system",
      title: p.title || "",
      body: p.body,
      category: p.category,
      template: p.template ?? null,
      audience: {
        type: p.audience.type,
        groupIds: p.audience.groupIds || [],
        userIds: p.audience.userIds || [],
      },
      recipientsCount: recipientIds.length,
      deliveredViaBot,
      readCount,
      isAuto: !!p.isAuto,
      relatedFeedback: p.relatedFeedback ?? null,
      sentAt: p.sentAt,
    });
  }

  const insertedNotifs = await bulkInsert(Notification, notifDocs);
  const recipientDocs = [];
  insertedNotifs.forEach((n, idx) => {
    for (const d of decisionsPerNotif[idx]) {
      recipientDocs.push({
        notification: n._id,
        user: d.user,
        readAt: d.readAt,
        botDeliveredAt: d.botDeliveredAt,
        botFailedReason: d.botFailedReason,
      });
    }
  });
  await bulkInsert(NotificationRecipient, recipientDocs);
  logger.info(
    `${insertedNotifs.length} ta notification, ${recipientDocs.length} ta recipient yaratildi`,
  );

  // ---------- TEACHER ABSENCES ----------
  const absenceDocs = [];
  for (const g of groups) {
    if (!g.schedule || g.schedule.length === 0) continue;
    const classDays = getClassDaysInRange(g, YEAR_AGO, NOW);
    if (classDays.length === 0) continue;
    const bucket = weighted([
      { value: [0, 1], weight: 35 },
      { value: [2, 5], weight: 40 },
      { value: [6, 15], weight: 20 },
      { value: [16, 25], weight: 5 },
    ]);
    const count = Math.min(randInt(bucket[0], bucket[1]), classDays.length);
    if (count === 0) continue;
    const teacher = g.teachers?.[0] || null;
    for (const cd of sample(classDays, count)) {
      absenceDocs.push({
        group: g._id,
        teacher,
        date: cd.date,
        dateKey: cd.dateKey || dateKeyOf(cd.date),
        recordedBy: owner._id,
      });
    }
  }
  await bulkInsert(TeacherAbsence, absenceDocs);
  logger.info(`${absenceDocs.length} ta teacher absence yaratildi`);

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `Fake extras tayyor (${secs}s): ${botDocs.length} bot user, ${insertedNotifs.length} notification, ${recipientDocs.length} recipient, ${absenceDocs.length} teacher absence`,
  );

  await disconnectDB();
};

seed().catch((err) => {
  logger.error(err);
  process.exit(1);
});
