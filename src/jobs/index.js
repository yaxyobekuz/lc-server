import agenda from "../config/agenda.js";
import logger from "../config/logger.js";
import defineCleanupExpiredTokens, {
  JOB_NAME as CLEANUP_JOB,
} from "./cleanupExpiredTokens.job.js";
import defineHolidayGreetings, {
  JOB_NAME as HOLIDAY_JOB,
} from "./holidayGreetings.job.js";
import defineAttendanceReminders, {
  JOB_NAME as ATTENDANCE_UNMARKED_JOB,
} from "./attendanceReminders.job.js";
import defineLowAttendanceDigest, {
  JOB_NAME as LOW_ATTENDANCE_JOB,
} from "./lowAttendanceDigest.job.js";
import defineNotificationDeliver from "./notificationDeliver.job.js";
import defineNotificationSchedule from "./notificationSchedule.job.js";

// Barcha cron jadvallari mahalliy (Asia/Tashkent) vaqt bo'yicha ishlaydi -
// server qaysi TZ da bo'lishidan qat'i nazar. Aks holda UTC serverда "20:00"
// Toshkentда 01:00 da ishlab, NOTO'G'RI kunni qamrab olardi.
const TZ = process.env.TZ_NAME || "Asia/Tashkent";
// agenda.every(interval, name, data, options) - vaqt zonasini options'da beramiz
const every = (cron, name) => agenda.every(cron, name, undefined, { timezone: TZ });

export const startJobs = async () => {
  defineCleanupExpiredTokens(agenda);
  defineHolidayGreetings(agenda);
  defineAttendanceReminders(agenda);
  defineLowAttendanceDigest(agenda);
  defineNotificationDeliver(agenda);
  defineNotificationSchedule(agenda);

  await agenda.start();

  // Har kuni 03:00 da eski tokenlarni tozalash
  await every("0 3 * * *", CLEANUP_JOB);

  // Bayram tabriklari - har kuni 08:30 da (past davomat bilan to'qnashmasin)
  await every("30 8 * * *", HOLIDAY_JOB);

  // Belgilanmagan davomat eslatmasi - har kuni 20:00 da
  await every("0 20 * * *", ATTENDANCE_UNMARKED_JOB);
  // Past davomat hisoboti - har dushanba 09:30 da
  await every("30 9 * * 1", LOW_ATTENDANCE_JOB);

  logger.info({ timezone: TZ }, "Agenda ishga tushirildi");
};

export const stopJobs = async () => {
  await agenda.stop();
  logger.info("Agenda to'xtatildi");
};
