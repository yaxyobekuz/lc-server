import logger from "../config/logger.js";
import {
  dueReminders,
  markReminderNotified,
} from "../modules/leads/services/leads.service.js";
import { create as createSystemNotification } from "../modules/systemNotifications/services/systemNotifications.service.js";

export const JOB_NAME = "lead.followup-reminders";

const fullName = (lead) =>
  `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lid";

// Vaqti kelgan qayta bog'lanish eslatmalari uchun tizim bildirishnomasi yaratadi
export default function defineLeadFollowupReminders(agenda) {
  agenda.define(JOB_NAME, async () => {
    const now = new Date();
    const leads = await dueReminders(now);
    let sent = 0;

    for (const lead of leads) {
      const note = lead.followUpNote ? ` - ${lead.followUpNote}` : "";
      try {
        await createSystemNotification({
          message: `Qayta bog'lanish: ${fullName(lead)}${note}`,
          link: "/owner/leads",
        });
        await markReminderNotified(lead._id, now);
        sent += 1;
      } catch (err) {
        logger.warn({ err, leadId: lead._id }, "Lid eslatmasi yuborilmadi");
      }
    }

    if (sent) logger.info({ sent }, "Lid qayta bog'lanish eslatmalari yuborildi");
  });
}
