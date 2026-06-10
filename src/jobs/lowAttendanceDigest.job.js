import logger from "../config/logger.js";
import User from "../models/user.model.js";
import { getDashboardStats } from "../modules/attendance/services/attendance.service.js";
import { send as sendNotification } from "../modules/notifications/services/notifications.service.js";
import { localTodayMidnight, localTodayKey } from "../helpers/attendance.helper.js";
import { ROLES } from "../constants/roles.js";

export const JOB_NAME = "weekly.low-attendance";

// Haftada bir marta: joriy oyda davomati chegaradan past o'quvchilar ro'yxatini
// egasiga yuboradi. (Sozlamadagi lowAttendanceThreshold ishlatiladi.)
export default function defineLowAttendanceDigest(agenda) {
  agenda.define(JOB_NAME, async () => {
    const today = localTodayMidnight();
    const from = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0),
    );

    const stats = await getDashboardStats({
      fromDate: from,
      toDate: today,
      page: 1,
      limit: 1,
    });
    const low = stats.lowAttendanceStudents || [];
    if (low.length === 0) {
      logger.info("Past davomatli o'quvchi yo'q");
      return;
    }

    const owners = await User.find(
      { role: ROLES.OWNER, isActive: true, isDeleted: { $ne: true } },
      { _id: 1 },
    );
    if (!owners.length) return;

    const lines = low
      .slice(0, 15)
      .map(
        (s) =>
          `• ${(s.student.lastName || "").trim()} ${(s.student.firstName || "").trim()} - ${s.rate}%`,
      );

    try {
      await sendNotification(
        {
          title: `Past davomat (${stats.threshold}% dan past)`,
          body: `Joriy oyda davomati past o'quvchilar:\n${lines.join("\n")}`,
          category: "attendance",
          audience: { type: "auto_system", userIds: owners.map((o) => o._id) },
          isAuto: true,
          dedupeKey: `low-attendance-owner:${localTodayKey()}`,
        },
        null,
      );
    } catch (err) {
      logger.warn({ err }, "Past davomat hisoboti yuborilmadi");
    }

    logger.info({ count: low.length }, "Past davomat hisoboti yuborildi");
  });
}
