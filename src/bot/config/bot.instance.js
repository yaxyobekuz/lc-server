import TelegramBot from "node-telegram-bot-api";
import env from "../../config/env.js";

let bot = null;

export const getBot = () => bot;

export const createBot = () => {
  if (bot) return bot;
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN env mavjud emas");
  }
  bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN, { polling: false });
  return bot;
};

export const destroyBot = () => {
  bot = null;
};
