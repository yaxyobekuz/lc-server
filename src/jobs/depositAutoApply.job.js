import logger from "../config/logger.js";
import * as depositService from "../modules/deposits/services/deposit.service.js";

export const JOB_NAME = "daily.deposit-auto-apply";

// XAVFSIZLIK TO'RI. Depozitda puli bor barcha o'quvchilarning ochiq qarzlarini
// eng eski oydan boshlab qoplaydi. Odatda qoplama qarz paydo bo'lgan zahoti
// bajariladi (depozit to'ldirish, guruh tarifi o'zgarishi, chegirma, a'zolik
// oylari, arxivlash ilgaklari) - bu job faqat o'tkazib yuborilgan yoki server
// o'chiq paytda yuz bergan holatlarni yig'ishtiradi. Idempotent: qoplaydigan
// narsa qolmasa hech nima yozmaydi.
export default function defineDepositAutoApply(agenda) {
  agenda.define(JOB_NAME, async () => {
    const result = await depositService.autoApplySweep();
    if (result.applied > 0) {
      logger.info(result, "Depozitdan avto-qoplash bajarildi");
    }
  });
}
