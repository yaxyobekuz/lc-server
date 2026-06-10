import logger from "../config/logger.js";
import { localTodayMidnight } from "../helpers/attendance.helper.js";
import * as salaryReportService from "../modules/teacherSalary/services/salaryReport.service.js";

export const JOB_NAME = "monthly.generate-salary";

// Har oy boshida joriy oy uchun o'qituvchi maoshlarini yaratadi (idempotent).
export default function defineGenerateMonthlySalary(agenda) {
  agenda.define(JOB_NAME, async () => {
    const today = localTodayMidnight();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    const result = await salaryReportService.regenerate(year, month);
    logger.info({ year, month, ...result }, "Oylik maoshlar generatsiya qilindi");
  });
}
