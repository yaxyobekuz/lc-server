import { upsertFromTelegram, getLinkedUser } from "../services/botUser.service.js";
import { mainMenuFor } from "../keyboards/main.keyboard.js";
import { requestContactKeyboard } from "../keyboards/contact.keyboard.js";

const startHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  await upsertFromTelegram(msg.from, chatId);

  const linked = await getLinkedUser(msg.from.id);

  if (linked) {
    await bot.sendMessage(
      chatId,
      `Assalomu alaykum, ${linked.firstName}!\n"Bayyina" o'quv markazi botiga xush kelibsiz.`,
      mainMenuFor(linked.role),
    );
    return;
  }

  const name = msg.from?.first_name || "foydalanuvchi";
  await bot.sendMessage(
    chatId,
    [
      `Assalomu alaykum, ${name}!`,
      "",
      "Profilingizni bog'lash uchun telefon raqamingizni yuboring.",
    ].join("\n"),
    requestContactKeyboard,
  );
};

export default startHandler;
