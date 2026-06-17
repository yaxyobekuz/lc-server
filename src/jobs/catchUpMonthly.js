import logger from "../config/logger.js";
import { localTodayMidnight } from "../helpers/attendance.helper.js";
import StudentPayment from "../models/studentPayment.model.js";
import TeacherSalary from "../models/teacherSalary.model.js";
import * as financeReportService from "../modules/finance/services/report.service.js";
import * as salaryReportService from "../modules/teacherSalary/services/salaryReport.service.js";

// Server qayta yonganda joriy oy generatsiyasi o'tkazib yuborilgan bo'lsa (1-sanada server
// o'chiq bo'lgan) to'ldiradi. Moliya maoshdan oldin - maosh tushumga bog'liq. Idempotent:
// oy uchun yozuv mavjud bo'lsa hech nima qilinmaydi.
export const catchUpMonthlyGeneration = async () => {
  const today = localTodayMidnight();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;

  try {
    if (!(await StudentPayment.exists({ year, month, isDeleted: { $ne: true } }))) {
      const result = await financeReportService.regenerate(year, month);
      logger.info({ year, month, ...result }, "Catch-up: oylik moliya generatsiya qilindi");
    }
    if (!(await TeacherSalary.exists({ year, month, isDeleted: { $ne: true } }))) {
      const result = await salaryReportService.regenerate(year, month);
      logger.info({ year, month, ...result }, "Catch-up: oylik maoshlar generatsiya qilindi");
    }
  } catch (err) {
    logger.warn({ err }, "Catch-up generatsiya bajarilmadi");
  }
};
