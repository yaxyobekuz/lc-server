import BotUser from "../../models/botUser.model.js";
import User from "../../models/user.model.js";
import { normalizePhone } from "../../utils/phone.js";

export const upsertFromTelegram = async (from, chatId) => {
  if (!from?.id) return null;
  const update = {
    chatId,
    username: from.username ? from.username.toLowerCase() : null,
    firstName: from.first_name || "",
    lastName: from.last_name || "",
    languageCode: from.language_code || "uz",
    isBot: Boolean(from.is_bot),
    isBlocked: false, // foydalanuvchi qayta yozdi → blok bekor qilinadi
    lastSeenAt: new Date(),
  };
  // Bir xil telegramId bir nechta hujjatda bo'lishi mumkin (har biri boshqa user) -
  // hammasi BIR XIL chat bo'lgani uchun chat holatini hammasiga yozamiz.
  await BotUser.updateMany({ telegramId: from.id }, { $set: update });
  // Hech qaysi hujjat bo'lmasa (birinchi /start, hali bog'lanmagan) - bittasini yaratamiz.
  return BotUser.findOneAndUpdate(
    { telegramId: from.id },
    { $set: update, $setOnInsert: { telegramId: from.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

// Bir xil telegramId barcha hujjatlarini bir xil blok holatiga keltiramiz.
export const markBlocked = async (telegramId, isBlocked = true) =>
  BotUser.updateMany({ telegramId }, { $set: { isBlocked } });

// Telegram contact orqali yuborilgan telefonni User.phone bilan moslashtiradi.
// KO'P-AKKAUNT: bog'lanish (telegramId, user) juftligi bo'yicha - bitta Telegram
// bir nechta userga bog'lanaveradi, eski bog'lanishni UZMAYMIZ.
export const linkByPhone = async (telegramId, rawPhone) => {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  const user = await User.findOne({ phone, isActive: true });
  if (!user) return null;

  // Shu chat (telegramId) uchun mavjud BotUser dan chatId ni olamiz (bo'lsa).
  const existing = await BotUser.findOne({ telegramId });

  await BotUser.findOneAndUpdate(
    { telegramId, user: user._id },
    {
      $set: { user: user._id },
      $setOnInsert: { telegramId, chatId: existing?.chatId ?? telegramId },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return user;
};

// Bitta Telegram bir nechta userga bog'langan bo'lishi mumkin - oxirgi (eng yangi)
// bog'langan, aktiv userni qaytaramiz (bot DM buyruqlari uchun).
export const getLinkedUser = async (telegramId) => {
  const botUser = await BotUser.findOne({
    telegramId,
    user: { $ne: null },
  })
    .sort({ updatedAt: -1 })
    .populate("user");
  if (!botUser || !botUser.user || !botUser.user.isActive) return null;
  return botUser.user;
};

// Chatdagi BARCHA bog'lanishlarni uzadi (shu telegramId bo'yicha har bir hujjat).
export const unlink = async (telegramId) =>
  BotUser.updateMany({ telegramId }, { $set: { user: null } });

const FLOW_TTL_MS = 30 * 60 * 1000;

// FlowState chatga tegishli (userga emas). Bir xil telegramId bir nechta hujjatda
// bo'lishi mumkin - izchillik uchun barchasiga BIR XIL flowState yozamiz.
export const setFlowState = async (telegramId, partial) => {
  const expiresAt = new Date(Date.now() + FLOW_TTL_MS);
  const flowState = { ...partial, expiresAt };
  return BotUser.updateMany({ telegramId }, { $set: { flowState } });
};

// FlowState olish (expire bo'lsa avto-clear va null qaytadi). Barcha hujjatlarda
// bir xil bo'lgani uchun istalganidan o'qiymiz.
export const getFlowState = async (telegramId) => {
  const bu = await BotUser.findOne({ telegramId });
  if (!bu?.flowState) return null;
  if (
    bu.flowState.expiresAt &&
    new Date(bu.flowState.expiresAt).getTime() < Date.now()
  ) {
    await clearFlowState(telegramId);
    return null;
  }
  return bu.flowState;
};

export const clearFlowState = async (telegramId) =>
  BotUser.updateMany({ telegramId }, { $set: { flowState: null } });
