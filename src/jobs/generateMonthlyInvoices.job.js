import logger from "../config/logger.js";
import * as invoicesService from "../modules/invoices/services/invoices.service.js";

export const JOB_NAME = "monthly.invoices-generate";

export default function defineGenerateMonthlyInvoices(agenda) {
  agenda.define(JOB_NAME, async () => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const result = await invoicesService.generateForPeriod({ year, month });
    logger.info(
      { year, month, ...result },
      "Oylik invoyslar avtomatik yaratildi",
    );
  });
}
