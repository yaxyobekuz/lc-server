import logger from "../config/logger.js";
import { dispatchScheduled } from "../modules/notifications/services/notifications.service.js";

export const JOB_NAME = "notification.send";

// Rejalashtirilgan xabarni belgilangan vaqt kelganda yuboradi.
// dispatchScheduled idempotent: status allaqachon "sent"/"canceled" bo'lsa skip qiladi,
// shuning uchun job qayta ishlasa ham dublikat yuborilmaydi.
export default function defineNotificationSchedule(agenda) {
  agenda.define(
    JOB_NAME,
    { concurrency: 1, lockLifetime: 5 * 60 * 1000 },
    async (job) => {
      const { notificationId } = job.attrs.data || {};
      if (!notificationId) return;
      try {
        await dispatchScheduled(notificationId);
      } catch (err) {
        logger.error(
          { err, notificationId },
          "Rejalashtirilgan xabarni yuborishda xato",
        );
        throw err; // Agenda qayta urinadi
      }
    },
  );
}
