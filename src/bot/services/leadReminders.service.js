import BotUser from "../../models/botUser.model.js";
import logger from "../../config/logger.js";
import { getBot } from "../config/bot.instance.js";
import { formatPhone } from "../utils/format.js";

const formatDate = (d) => {
  const dd = new Date(d);
  if (Number.isNaN(dd.getTime())) return "-";
  const day = String(dd.getUTCDate()).padStart(2, "0");
  const mon = String(dd.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${mon}.${dd.getUTCFullYear()}`;
};

const findChatId = async (userId) => {
  if (!userId) return null;
  const bu = await BotUser.findOne({ user: userId });
  if (!bu || bu.isBlocked) return null;
  return bu.chatId;
};

// Returns true if a message was sent, false otherwise (no link / bot off / blocked)
export const notifyAssignedStaff = async (lead) => {
  if (!lead.assignedTo) return false;
  const staffId = lead.assignedTo._id || lead.assignedTo;
  const chatId = await findChatId(staffId);
  if (!chatId) return false;

  const bot = getBot();
  if (!bot) return false;

  const fullName =
    `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lid";
  const phone = formatPhone(lead.phone);
  const note = lead.followUpNote || "qayta bog'lanish";
  const date = lead.followUpDate ? formatDate(lead.followUpDate) : "";

  const text =
    `🔔 Lid eslatmasi (${date})\n` +
    `${fullName} (${phone})\n` +
    `Eslatma: ${note}`;

  try {
    await bot.sendMessage(chatId, text);
    return true;
  } catch (err) {
    logger.warn({ err, chatId, leadId: lead._id }, "Lid eslatma yuborib bo'lmadi");
    return false;
  }
};
