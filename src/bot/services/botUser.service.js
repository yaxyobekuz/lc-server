import BotUser from "../../models/botUser.model.js";

export const upsertFromTelegram = async (from, chatId) => {
  if (!from?.id) return null;
  const update = {
    chatId,
    username: from.username ? from.username.toLowerCase() : null,
    firstName: from.first_name || "",
    lastName: from.last_name || "",
    languageCode: from.language_code || "uz",
    isBot: Boolean(from.is_bot),
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
