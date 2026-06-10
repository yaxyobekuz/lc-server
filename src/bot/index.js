import env from "../config/env.js";
import logger from "../config/logger.js";
import { createBot, getBot, destroyBot } from "./config/bot.instance.js";
import { registerHandlers } from "./bot.router.js";
import BotLock from "../models/botLock.model.js";

const LOCK_ID = "poller";
const LOCK_TTL_MS = 90 * 1000;
const HOLDER = `${process.pid}-${Date.now()}`;
let heartbeat = null;

// Polling lock'ini olishga harakat qiladi. Xatolik bo'lsa fail-open: true qaytaradi
// (bitta instans har doim ishlashi uchun - yo'q-polling regressiyasidan ko'ra
//  ehtimoliy ikki-polling afzal).
const acquirePollLock = async () => {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    const updated = await BotLock.findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ expiresAt: { $lte: now } }, { holder: HOLDER }] },
      { $set: { holder: HOLDER, expiresAt } },
      { new: true },
    );
    if (updated) return true;
    // Hujjat yo'q bo'lsa - yaratamiz; band bo'lsa E11000 -> false
    await BotLock.create({ _id: LOCK_ID, holder: HOLDER, expiresAt });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false; // boshqa instans ushlab turibdi
    logger.warn({ err }, "Bot lock olishda xato - fail-open (polling yoqiladi)");
    return true;
  }
};

const startHeartbeat = () => {
  heartbeat = setInterval(() => {
    acquirePollLock().catch(() => null);
  }, LOCK_TTL_MS / 3);
  if (heartbeat.unref) heartbeat.unref();
};

export const startBot = async () => {
  if (!env.TELEGRAM_BOT_ENABLED) {
    logger.info("Telegram bot o'chirilgan (TELEGRAM_BOT_ENABLED=false)");
    return null;
  }
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn("TELEGRAM_BOT_TOKEN bo'sh, bot ishga tushirilmadi");
    return null;
  }

  // Bot instansi har doim yaratiladi (xabar YUBORISH polling talab qilmaydi).
  const bot = createBot();
  registerHandlers(bot);

  // Polling'ni faqat lock'ni olgan instans boshlaydi (409 conflict oldini olish).
  const canPoll = await acquirePollLock();
  if (!canPoll) {
    logger.info(
      "Boshqa instans Telegram polling qilyapti - bu instans faqat yuborish rejimida",
    );
    return bot;
  }

  await bot.startPolling({ restart: true });
  startHeartbeat();

  const me = await bot.getMe();
  logger.info({ username: me.username }, "Telegram bot ishga tushdi (polling)");

  await bot.setMyCommands([
    { command: "start", description: "Botni ishga tushirish" },
    { command: "help", description: "Yordam" },
  ]);

  return bot;
};

export const stopBot = async () => {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  await BotLock.deleteOne({ _id: LOCK_ID, holder: HOLDER }).catch(() => null);
  const bot = getBot();
  if (!bot) return;
  await bot.stopPolling({ cancel: true }).catch(() => null);
  destroyBot();
  logger.info("Telegram bot to'xtatildi");
};
