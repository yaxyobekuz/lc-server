import BotUser from "../../models/botUser.model.js";
import logger from "../../config/logger.js";
import { getBot } from "../config/bot.instance.js";
import { formatMoney } from "../utils/format.js";

const MONTH_LABELS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

const findChatId = async (teacherId) => {
  const bu = await BotUser.findOne({ user: teacherId });
  if (!bu || bu.isBlocked) return null;
  return bu.chatId;
};

const sendSafe = async (chatId, text) => {
  const bot = getBot();
  if (!bot || !chatId) return;
  try {
    await bot.sendMessage(chatId, text);
  } catch (err) {
    logger.warn({ err, chatId }, "Bot xabar yuborib bo'lmadi");
  }
};

export const notifyCalculated = async (teacherId, salary) => {
  const chatId = await findChatId(teacherId);
  if (!chatId) return;
  const month = MONTH_LABELS[salary.period.month - 1];
  const text =
    `📊 ${month} ${salary.period.year} uchun oylik hisoblandi.\n` +
    `Yakuniy summa: ${formatMoney(salary.finalAmount)}\n` +
    `Tafsilot uchun panelga kiring.`;
  await sendSafe(chatId, text);
};

export const notifyPaid = async (teacherId, payout, salary) => {
  const chatId = await findChatId(teacherId);
  if (!chatId) return;
  const month = MONTH_LABELS[salary.period.month - 1];
  const remaining = Math.max(
    0,
    (salary.finalAmount || 0) - (salary.paidAmount || 0),
  );
  const text =
    `💸 ${month} ${salary.period.year} oyligidan to'lov:\n` +
    `Summa: ${formatMoney(payout.amount)}\n` +
    `Qoldiq: ${formatMoney(remaining)}`;
  await sendSafe(chatId, text);
};
