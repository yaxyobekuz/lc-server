import * as teacherSalaryService from "./teacherSalary.service.js";
import * as systemNotificationsService from "../../systemNotifications/services/systemNotifications.service.js";
import logger from "../../../config/logger.js";

// Berilgan oy uchun o'qituvchi maoshlarini generatsiya qiladi.
export const regenerate = async (year, month) => {
  const result = await teacherSalaryService.generateMonth(year, month);
  // Bildirishnoma faqat real yangi yozuv yaratilganda - qayta ishga tushishdagi spam'ning oldini olish.
  if (result.created > 0) {
    try {
      await systemNotificationsService.create({
        message: `${month}-oy (${year}) uchun o'qituvchi maoshlari generatsiya qilindi`,
        link: "/owner/finance/teacher-salaries",
      });
    } catch (err) {
      logger.warn({ err }, "Maosh generatsiya bildirishnomasi yuborilmadi");
    }
  }
  return result;
};
