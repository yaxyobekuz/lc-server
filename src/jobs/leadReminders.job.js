import logger from "../config/logger.js";
import {
  getTodayReminders,
  markReminderSent,
} from "../modules/leads/services/leads.service.js";
import { get as getLeadSettings } from "../modules/leadSettings/services/leadSettings.service.js";

export const JOB_NAME = "daily.lead-reminders";

const sameUtcDay = (a, b) => {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
};

export default function defineLeadReminders(agenda) {
  agenda.define(JOB_NAME, async () => {
    const settings = await getLeadSettings();
    if (!settings.reminderEnabled) {
      logger.info("Lid eslatmalari o'chirilgan, skip");
      return;
    }

    const today = new Date();
    const leads = await getTodayReminders();
    let sent = 0;
    let skipped = 0;

    // Lazy import - circular dependency oldini olish
    const { notifyAssignedStaff } = await import(
      "../bot/services/leadReminders.service.js"
    );

    for (const lead of leads) {
      if (sameUtcDay(lead.reminderSentAt, today)) {
        skipped += 1;
        continue;
      }
      try {
        const ok = await notifyAssignedStaff(lead);
        if (ok) {
          await markReminderSent(lead._id);
          sent += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        logger.warn({ err, leadId: lead._id }, "Lid eslatma yuborishda xato");
        skipped += 1;
      }
    }

    logger.info({ sent, skipped, total: leads.length }, "Lid eslatmalari yuborildi");
  });
}
