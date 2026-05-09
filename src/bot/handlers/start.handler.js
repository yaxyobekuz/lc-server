import { upsertFromTelegram } from "../services/botUser.service.js";
import { mainMenuKeyboard } from "../keyboards/main.keyboard.js";

const startHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  await upsertFromTelegram(msg.from, chatId);

  const name = msg.from?.first_name || "foydalanuvchi";
  await bot.sendMessage(
    chatId,
    `Assalomu alaykum, ${name}!\n\n"Bayyina" o'quv markazi botiga xush kelibsiz.`,
    mainMenuKeyboard,
  );
};

export default startHandler;
