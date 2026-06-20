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
import defineLeadFollowupReminders, {
  JOB_NAME as LEAD_FOLLOWUP_JOB,
} from "./leadFollowupReminders.job.js";
import defineGenerateMonthlyFinance, {
  JOB_NAME as MONTHLY_FINANCE_JOB,
} from "./generateMonthlyFinance.job.js";
import defineGenerateMonthlySalary, {
  JOB_NAME as MONTHLY_SALARY_JOB,
} from "./generateMonthlySalary.job.js";
import defineAutoEndGroups, {
  JOB_NAME as AUTO_END_GROUPS_JOB,
} from "./autoEndGroups.job.js";
import { catchUpMonthlyGeneration } from "./catchUpMonthly.js";
import * as groupsService from "../modules/groups/services/groups.service.js";

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
  defineLeadFollowupReminders(agenda);
  defineGenerateMonthlyFinance(agenda);
  defineGenerateMonthlySalary(agenda);
  defineAutoEndGroups(agenda);

  await agenda.start();

  // Har kuni 03:00 da eski tokenlarni tozalash
  await every("0 3 * * *", CLEANUP_JOB);

  // Bayram tabriklari - har kuni 08:30 da (past davomat bilan to'qnashmasin)
  await every("30 8 * * *", HOLIDAY_JOB);

  // Belgilanmagan davomat eslatmasi - har kuni 20:00 da
  await every("0 20 * * *", ATTENDANCE_UNMARKED_JOB);
  // Past davomat hisoboti - har dushanba 09:30 da
  await every("30 9 * * 1", LOW_ATTENDANCE_JOB);

  // Lid qayta bog'lanish eslatmalari - har 5 daqiqada vaqti kelganlarni tekshiradi
  await every("*/5 * * * *", LEAD_FOLLOWUP_JOB);

  // Oylik moliya generatsiyasi - har oy 1-sanasi 00:05 da
  await every("5 0 1 * *", MONTHLY_FINANCE_JOB);
  // Oylik maosh generatsiyasi - har oy 1-sanasi 00:06 da (moliyadan keyin)
  await every("6 0 1 * *", MONTHLY_SALARY_JOB);

  // Tugash sanasi yetgan kurslarni avto-arxivlash - har kuni 00:10 da
  await every("10 0 * * *", AUTO_END_GROUPS_JOB);

  logger.info({ timezone: TZ }, "Agenda ishga tushirildi");

  // Server o'chiq paytda (1-sanada) o'tkazib yuborilgan oylik generatsiyani fonда to'ldiradi.
  // Await qilinmaydi - startup'ni bloklamaslik uchun; o'zi xatolarni ushlaydi.
  catchUpMonthlyGeneration();

  // Boot catch-up: server o'chiq paytda tugash sanasi yetgan kurslarni arxivlaydi.
  groupsService.processDueGroupEnds().catch((err) => {
    logger.warn({ err }, "Boot: tugagan kurslar avto-arxivlanmadi");
  });
};

export const stopJobs = async () => {
  await agenda.stop();
  logger.info("Agenda to'xtatildi");
};
