import logger from "../config/logger.js";
import { deliverNotification } from "../modules/notifications/services/notifications.service.js";

export const JOB_NAME = "notification.deliver";

// Bitta bildirishnomani bot orqali yetkazadi (so'rov oqimidan ajratilgan).
// Idempotent: deliverNotification faqat botDeliveredAt=null oluvchilarni uradi,
// shuning uchun job qayta ishlasa ham dublikat yuborilmaydi.
export default function defineNotificationDeliver(agenda) {
  agenda.define(
    JOB_NAME,
    { concurrency: 1, lockLifetime: 5 * 60 * 1000 },
    async (job) => {
      const { notificationId } = job.attrs.data || {};
      if (!notificationId) return;
      try {
        await deliverNotification(notificationId);
      } catch (err) {
        logger.error({ err, notificationId }, "Bildirishnoma yetkazishda xato");
        throw err; // Agenda qayta urinadi
      }
    },
  );
}
