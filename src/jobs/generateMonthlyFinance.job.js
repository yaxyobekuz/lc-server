import logger from "../config/logger.js";
import { localTodayMidnight } from "../helpers/attendance.helper.js";
import * as reportService from "../modules/finance/services/report.service.js";

export const JOB_NAME = "monthly.generate-finance";

// Har oy boshida joriy oy uchun guruh to'lovlari + o'quvchi to'lovlarini yaratadi.
// Idempotent: mavjud yozuvlar (qo'lda tahrirlangan fee, to'langan to'lov) tegilmaydi.
export default function defineGenerateMonthlyFinance(agenda) {
  agenda.define(JOB_NAME, async () => {
    const today = localTodayMidnight();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    const result = await reportService.regenerate(year, month);
    logger.info({ year, month, ...result }, "Oylik moliya generatsiya qilindi");
  });
}
