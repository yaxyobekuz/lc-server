import { getLinkedUser } from "../services/botUser.service.js";
import { ROLES } from "../../constants/roles.js";

const STUDENT_HELP = [
  "📚 Talaba paneli imkoniyatlari:",
  "",
  "• Mening to'lovlarim — joriy qarz, jami to'langan, ochiq hisoblar",
  "• Dars jadvali — bu haftaning jadvali",
  "• Davomatim — joriy oy davomati statistikasi",
  "• Feedback — taklif, shikoyat yoki murojaat yuborish",
  "• 🚀 Mini ilova — to'liq panelga avto-kirish",
  "",
  "Buyruqlar: /start — qayta ishga tushirish, /cancel — joriy amalni bekor qilish.",
];

const TEACHER_HELP = [
  "👨‍🏫 O'qituvchi paneli imkoniyatlari:",
  "",
  "• Mening guruhlarim — guruhlar va o'quvchilar ro'yxati",
  "• Dars jadvali — bu haftaning jadvali",
  "• Davomat — bugungi guruhlar va davomat holati",
  "• Oyligim — joriy oy maoshi va to'lov holati",
  "• Feedback — admin bilan bog'lanish",
  "• 🚀 Mini ilova — to'liq panelga avto-kirish",
  "",
  "Buyruqlar: /start — qayta ishga tushirish, /cancel — joriy amalni bekor qilish.",
];

const OWNER_HELP = [
  "🏢 Egasi paneli:",
  "",
  "• 🚀 Mini ilova — barcha boshqaruv funksiyalari uchun panel",
  "• Feedback — taklif yoki shikoyat",
  "",
  "Buyruqlar: /start — qayta ishga tushirish, /cancel — joriy amalni bekor qilish.",
];

const UNLINKED_HELP = [
  "Salom! Bayyina ta'lim markazi botiga xush kelibsiz.",
  "",
  "Botdan foydalanish uchun avval telefon raqamingizni yuboring.",
  "/start ni bosing va telefon yuborish tugmasini bosing.",
  "",
  "Yordam uchun administrator bilan bog'laning.",
];

const helpHandler = async (bot, msg) => {
  const linked = await getLinkedUser(msg.from.id);

  let lines;
  if (!linked) {
    lines = UNLINKED_HELP;
  } else if (linked.role === ROLES.STUDENT) {
    lines = STUDENT_HELP;
  } else if (linked.role === ROLES.TEACHER) {
    lines = TEACHER_HELP;
  } else {
    lines = OWNER_HELP;
  }

  await bot.sendMessage(msg.chat.id, lines.join("\n"));
};

export default helpHandler;
