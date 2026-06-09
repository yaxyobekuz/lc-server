import env from "../../config/env.js";
import { ROLES } from "../../constants/roles.js";

const webAppButton = {
  text: "🔐 Tizimga kirish",
  web_app: { url: env.TELEGRAM_BOT_WEBAPP_URL },
};

const STUDENT_KB = {
  reply_markup: {
    keyboard: [
      [{ text: "Dars jadvali" }, { text: "Davomatim" }],
      [{ text: "Feedback" }],
      [webAppButton],
      [{ text: "Yordam" }],
    ],
    resize_keyboard: true,
  },
};

const TEACHER_KB = {
  reply_markup: {
    keyboard: [
      [{ text: "Mening guruhlarim" }, { text: "Dars jadvali" }],
      [{ text: "Davomat" }, { text: "Feedback" }],
      [webAppButton],
      [{ text: "Yordam" }],
    ],
    resize_keyboard: true,
  },
};

const OWNER_KB = {
  reply_markup: {
    keyboard: [
      [webAppButton],
      [{ text: "Feedback" }, { text: "Yordam" }],
    ],
    resize_keyboard: true,
  },
};

const UNLINKED_KB = {
  reply_markup: {
    keyboard: [[{ text: "Yordam" }]],
    resize_keyboard: true,
  },
};

export const mainMenuFor = (role) => {
  switch (role) {
    case ROLES.TEACHER:
      return TEACHER_KB;
    case ROLES.STUDENT:
      return STUDENT_KB;
    case ROLES.OWNER:
      return OWNER_KB;
    default:
      return UNLINKED_KB;
  }
};

// Eski importlar uchun fallback (bot/start uchun)
export const mainMenuKeyboard = UNLINKED_KB;
