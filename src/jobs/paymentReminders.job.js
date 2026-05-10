import logger from "../config/logger.js";
import Invoice from "../models/invoice.model.js";
import BotUser from "../models/botUser.model.js";
import { get as getSettings } from "../modules/paymentSettings/services/paymentSettings.service.js";
import { getBot } from "../bot/config/bot.instance.js";
import { formatMoney } from "../bot/utils/format.js";

export const JOB_NAME = "daily.payment-reminders";

const sameUtcDay = (a, b) =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

const daysBetween = (a, b) => {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const classifyReminder = (invoice, settings, now) => {
  const due = new Date(invoice.dueDate);
  const diff = daysBetween(due, now); // due - now: musbat bo'lsa kelajak

  if (diff > 0 && diff <= settings.remindBeforeDays) return "before";
  if (diff === 0) return "due";
  if (diff < 0) {
    const overdueDays = Math.abs(diff);
    if (settings.repeatAfterOverdueDays > 0 && overdueDays % settings.repeatAfterOverdueDays === 0) {
      return "overdue";
    }
  }
  return null;
};

const formatPeriod = (period) => {
  const m = String(period.month).padStart(2, "0");
  return `${m}.${period.year}`;
};

const formatReminderText = (invoice, kind) => {
  const period = formatPeriod(invoice.period);
  const remaining = Math.max(0, invoice.totalDue - invoice.paidAmount);
  if (kind === "before") {
    return [
      `Eslatma: ${period} oyi uchun to'lov muddati yaqinlashmoqda.`,
      `Qoldiq: ${formatMoney(remaining)}`,
    ].join("\n");
  }
  if (kind === "due") {
    return [
      `Bugun ${period} oyi uchun to'lov muddati tugaydi.`,
      `Qoldiq: ${formatMoney(remaining)}`,
    ].join("\n");
  }
  // overdue
  return [
    `Diqqat: ${period} oyi uchun to'lov muddati o'tgan.`,
    `Qoldiq: ${formatMoney(remaining)}`,
  ].join("\n");
};

export default function definePaymentReminders(agenda) {
  agenda.define(JOB_NAME, async () => {
    const settings = await getSettings();
    if (!settings.reminderEnabled) {
      logger.info("To'lov eslatmalari o'chirilgan");
      return;
    }

    const bot = getBot();
    if (!bot) {
      logger.warn("Bot yo'q, to'lov eslatmalari yuborilmadi");
      return;
    }

    const now = new Date();
    const invoices = await Invoice.find({
      status: { $in: ["unpaid", "partial"] },
    }).populate("student");

    let sent = 0;
    for (const inv of invoices) {
      if (!inv.student) continue;
      const kind = classifyReminder(inv, settings, now);
      if (!kind) continue;

      // Bir kunda bir marta
      const already = (inv.remindersSent || []).some((r) =>
        sameUtcDay(new Date(r.at), now),
      );
      if (already) continue;

      const linked = await BotUser.findOne({ user: inv.student._id });
      if (!linked || linked.isBlocked) continue;

      try {
        await bot.sendMessage(linked.chatId, formatReminderText(inv, kind));
        inv.remindersSent.push({ at: now, kind });
        await inv.save();
        sent += 1;
      } catch (err) {
        logger.error({ err, invoiceId: inv._id }, "Eslatma yuborishda xato");
      }
    }
    logger.info({ sent, scanned: invoices.length }, "To'lov eslatmalari yuborildi");
  });
}
