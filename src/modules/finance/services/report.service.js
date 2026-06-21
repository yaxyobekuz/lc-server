import * as groupFeeService from "./groupFee.service.js";
import * as studentPaymentService from "./studentPayment.service.js";
import * as depositService from "../../deposits/services/deposit.service.js";
import * as systemNotificationsService from "../../systemNotifications/services/systemNotifications.service.js";
import logger from "../../../config/logger.js";

// Berilgan oy uchun guruh to'lovlari + o'quvchi to'lovlarini generatsiya qiladi.
export const regenerate = async (year, month) => {
  const feeResult = await groupFeeService.generateMonth(year, month);
  const paymentResult = await studentPaymentService.generateMonth(year, month);

  // Yangi oy planlari yaratilgach - depoziti bor o'quvchilarning qarzini avto qoplaymiz.
  try {
    await depositService.autoApplyForMonth(year, month);
  } catch (err) {
    logger.warn({ err }, "Oylik depozit avto-qoplash xatosi");
  }

  // Bildirishnoma faqat real yangi yozuv yaratilganda - qayta ishga tushishdagi spam'ning oldini olish.
  if (feeResult.created > 0 || paymentResult.created > 0) {
    try {
      await systemNotificationsService.create({
        message: `${month}-oy (${year}) uchun oylik to'lovlar generatsiya qilindi`,
        link: "/owner/finance/student-payments",
      });
    } catch (err) {
      logger.warn({ err }, "Moliya generatsiya bildirishnomasi yuborilmadi");
    }
  }

  return { fees: feeResult, payments: paymentResult };
};
