import logger from "../config/logger.js";
import {
  getTodayHolidays,
  isAlreadySentToday,
  markSent,
} from "../modules/holidays/services/holidays.service.js";
import { send as sendNotification } from "../modules/notifications/services/notifications.service.js";
import { localTodayKey } from "../helpers/attendance.helper.js";

export const JOB_NAME = "daily.holiday-greetings";

const audienceMap = {
  all: { type: "all_students" }, // V1: hammaga = all_students + all_teachers ikkala marta yuboriladi
  students: { type: "all_students" },
  teachers: { type: "all_teachers" },
};

const dispatchHoliday = async (holiday, dayKey) => {
  const audiences =
    holiday.audience === "all"
      ? [{ type: "all_students" }, { type: "all_teachers" }]
      : [audienceMap[holiday.audience] || { type: "all_students" }];

  for (const audience of audiences) {
    await sendNotification(
      {
        title: holiday.name,
        body: holiday.message,
        category: "holiday",
        audience,
        isAuto: true,
        // Bir bayram-auditoriya-kun bo'yicha bitta xabar (instanslararo poyga/qayta
        // ishga tushishda dublikat bo'lmasin)
        dedupeKey: `holiday:${String(holiday._id)}:${audience.type}:${dayKey}`,
      },
      null,
    );
  }
};

export default function defineHolidayGreetings(agenda) {
  agenda.define(JOB_NAME, async () => {
    const today = new Date();
    const dayKey = localTodayKey(today);
    const holidays = await getTodayHolidays(today);
    let sent = 0;
    let skipped = 0;

    for (const h of holidays) {
      if (isAlreadySentToday(h, today)) {
        skipped += 1;
        continue;
      }
      try {
        await dispatchHoliday(h, dayKey);
        await markSent(h._id, today);
        sent += 1;
      } catch (err) {
        logger.warn({ err, holidayId: h._id }, "Bayram tabrigi yuborilmadi");
      }
    }

    logger.info(
      { total: holidays.length, sent, skipped },
      "Bayram tabriklari yuborildi",
    );
  });
}
