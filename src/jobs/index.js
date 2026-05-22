import agenda from "../config/agenda.js";
import logger from "../config/logger.js";
import defineCleanupExpiredTokens, {
  JOB_NAME as CLEANUP_JOB,
} from "./cleanupExpiredTokens.job.js";
import defineGenerateMonthlyInvoices, {
  JOB_NAME as MONTHLY_INVOICES_JOB,
} from "./generateMonthlyInvoices.job.js";
import definePaymentReminders, {
  JOB_NAME as REMINDERS_JOB,
} from "./paymentReminders.job.js";
import defineSalaryAutoCalculate, {
  JOB_NAME as SALARY_JOB,
} from "./salaryAutoCalculate.job.js";
import defineLeadReminders, {
  JOB_NAME as LEAD_REMINDERS_JOB,
} from "./leadReminders.job.js";
import defineHolidayGreetings, {
  JOB_NAME as HOLIDAY_JOB,
} from "./holidayGreetings.job.js";
import { get as getSalarySettings } from "../modules/salarySettings/services/salarySettings.service.js";
import { get as getLeadSettings } from "../modules/leadSettings/services/leadSettings.service.js";

export const startJobs = async () => {
  defineCleanupExpiredTokens(agenda);
  defineGenerateMonthlyInvoices(agenda);
  definePaymentReminders(agenda);
  defineSalaryAutoCalculate(agenda);
  defineLeadReminders(agenda);
  defineHolidayGreetings(agenda);

  await agenda.start();

  // Har kuni 03:00 da eski tokenlarni tozalash
  await agenda.every("0 3 * * *", CLEANUP_JOB);
  // Har oyning 1-sanasida 02:00 da invoyslarni yaratish
  await agenda.every("0 2 1 * *", MONTHLY_INVOICES_JOB);
  // Har kuni 09:00 da to'lov eslatmalarini yuborish
  await agenda.every("0 9 * * *", REMINDERS_JOB);

  // Maoshlarni avto hisoblash - sozlamadagi kunda 02:30 da
  const salarySettings = await getSalarySettings();
  await agenda.every(
    `30 2 ${salarySettings.autoCalculateOnDay} * *`,
    SALARY_JOB,
  );

  // Lid eslatmalari - har kuni sozlamadagi soatda
  const leadSettings = await getLeadSettings();
  await agenda.every(`0 ${leadSettings.remindHourOfDay} * * *`, LEAD_REMINDERS_JOB);

  // Bayram tabriklari - har kuni 09:00 da
  await agenda.every("0 9 * * *", HOLIDAY_JOB);

  logger.info("Agenda ishga tushirildi");
};

// Settings o'zgarganda qayta schedule qilish uchun
export const rescheduleSalaryJob = async (dayOfMonth) => {
  await agenda.cancel({ name: SALARY_JOB });
  await agenda.every(`30 2 ${dayOfMonth} * *`, SALARY_JOB);
  logger.info({ dayOfMonth }, "Maosh hisoblash jobi qayta sozlandi");
};

export const rescheduleLeadReminders = async (hourOfDay) => {
  await agenda.cancel({ name: LEAD_REMINDERS_JOB });
  await agenda.every(`0 ${hourOfDay} * * *`, LEAD_REMINDERS_JOB);
  logger.info({ hourOfDay }, "Lid eslatma jobi qayta sozlandi");
};

export const stopJobs = async () => {
  await agenda.stop();
  logger.info("Agenda to'xtatildi");
};
