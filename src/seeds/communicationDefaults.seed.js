import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import NotificationTemplate from "../models/notificationTemplate.model.js";
import FeedbackType from "../models/feedbackType.model.js";
import Holiday from "../models/holiday.model.js";
import logger from "../config/logger.js";

const TEMPLATES = [
  {
    name: "Bayram tabrigi",
    body: "Hurmatli mijoz, sizni bayram bilan qutlaymiz! Bayyina jamoasi.",
    category: "holiday",
  },
  {
    name: "Dars bekor qilindi",
    body: "Hurmatli o'quvchi, bugungi darsimiz bekor qilindi. Murojaat uchun raqam: ...",
    category: "class_cancel",
  },
  {
    name: "Yangi e'lon",
    body: "Bayyina ta'lim markazidan e'lon: ...",
    category: "announcement",
  },
  {
    name: "Shaxsiy xabar",
    body: "Sizga shaxsiy xabar: ...",
    category: "personal",
  },
  {
    name: "Qarz ogohlantirish",
    body: "Sizda to'lanmagan qarz mavjud. Iltimos, eng qisqa muddatda hal qiling.",
    category: "debt",
  },
  {
    name: "Tabrik",
    body: "Sizni Bayyina jamoasi tabriklaydi!",
    category: "custom",
  },
];

const FEEDBACK_TYPES = [
  "O'qituvchi haqida",
  "Dars sifati",
  "Markaz haqida",
  "Taklif",
  "Shikoyat",
  "Guruh almashtirish so'rovi",
  "To'lov muddati uzaytirish",
  "Boshqa",
];

const HOLIDAYS = [
  {
    name: "Yangi yil",
    isRecurring: true,
    month: 1,
    day: 1,
    audience: "all",
    message:
      "Yangi yilingiz muborak bo'lsin! Sog'lik, baxt va omad tilaymiz! Bayyina jamoasi.",
  },
  {
    name: "Xotin-qizlar bayrami",
    isRecurring: true,
    month: 3,
    day: 8,
    audience: "all",
    message:
      "8-mart - Xalqaro xotin-qizlar kuni muborak bo'lsin! Bayyina jamoasi.",
  },
  {
    name: "Navro'z",
    isRecurring: true,
    month: 3,
    day: 21,
    audience: "all",
    message: "Navro'z bayrami muborak bo'lsin! Bayyina jamoasi.",
  },
  {
    name: "Xotira va qadrlash kuni",
    isRecurring: true,
    month: 5,
    day: 9,
    audience: "all",
    message:
      "9-may - Xotira va qadrlash kuni muborak. Bayyina jamoasi.",
  },
  {
    name: "Mustaqillik kuni",
    isRecurring: true,
    month: 9,
    day: 1,
    audience: "all",
    message:
      "Mustaqillik bayrami muborak bo'lsin! Bayyina jamoasi.",
  },
  {
    name: "O'qituvchilar va murabbiylar kuni",
    isRecurring: true,
    month: 10,
    day: 1,
    audience: "teachers",
    message:
      "Hurmatli o'qituvchimiz, kasb bayramingiz muborak! Bayyina jamoasi.",
  },
];

const seed = async () => {
  await connectDB();

  for (const t of TEMPLATES) {
    await NotificationTemplate.findOneAndUpdate(
      { name: t.name, isActive: true },
      { $setOnInsert: { ...t, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  logger.info(`Notification shablonlari seed qilindi: ${TEMPLATES.length}`);

  for (const name of FEEDBACK_TYPES) {
    await FeedbackType.findOneAndUpdate(
      { name, isActive: true },
      { $setOnInsert: { name, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  logger.info(`Feedback turlari seed qilindi: ${FEEDBACK_TYPES.length}`);

  for (const h of HOLIDAYS) {
    await Holiday.findOneAndUpdate(
      { name: h.name },
      { $setOnInsert: { ...h, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  logger.info(`Bayramlar seed qilindi: ${HOLIDAYS.length}`);

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Communication defaults seed xato");
  process.exit(1);
});
