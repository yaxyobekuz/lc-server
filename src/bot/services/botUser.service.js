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
  return BotUser.findOneAndUpdate(
    { telegramId: from.id },
    { $set: update, $setOnInsert: { telegramId: from.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

export const markBlocked = async (telegramId, isBlocked = true) =>
  BotUser.findOneAndUpdate({ telegramId }, { $set: { isBlocked } }, { new: true });

// Telegram contact orqali yuborilgan telefonni User.phone bilan moslashtiradi
export const linkByPhone = async (telegramId, rawPhone) => {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;

  const user = await User.findOne({ phone, isActive: true });
  if (!user) return null;

  // Bitta akkaunt faqat bitta Telegramga bog'lansin - oxirgi kontakt yuborgan
  // Telegramga avtomatik o'tkazamiz, eski bog'lanishni uzamiz (unique indeks buzilmasin)
  await BotUser.updateMany(
    { user: user._id, telegramId: { $ne: telegramId } },
    { $set: { user: null } },
  );

  await BotUser.findOneAndUpdate(
    { telegramId },
    { $set: { user: user._id } },
    { new: true },
  );
  return user;
};

export const getLinkedUser = async (telegramId) => {
  const botUser = await BotUser.findOne({ telegramId }).populate("user");
  if (!botUser || !botUser.user || !botUser.user.isActive) return null;
  return botUser.user;
};

export const unlink = async (telegramId) =>
  BotUser.findOneAndUpdate({ telegramId }, { $set: { user: null } }, { new: true });

const FLOW_TTL_MS = 30 * 60 * 1000;

// FlowState yangilash (merge)
export const setFlowState = async (telegramId, partial) => {
  const expiresAt = new Date(Date.now() + FLOW_TTL_MS);
  const flowState = { ...partial, expiresAt };
  return BotUser.findOneAndUpdate(
    { telegramId },
    { $set: { flowState } },
    { new: true },
  );
};

// FlowState olish (expire bo'lsa avto-clear va null qaytadi)
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
  BotUser.findOneAndUpdate(
    { telegramId },
    { $set: { flowState: null } },
    { new: true },
  );
