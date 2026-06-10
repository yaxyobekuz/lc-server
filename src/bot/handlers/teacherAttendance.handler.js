import { getLinkedUser } from "../services/botUser.service.js";
import { ROLES } from "../../constants/roles.js";
import { listForTeacher } from "../../modules/groups/services/groups.service.js";
import { listForGroupOnDate } from "../../modules/attendance/services/attendance.service.js";
import {
  localTodayMidnight,
  localDayOfWeek,
  scheduleActiveOn,
} from "../../helpers/attendance.helper.js";

const DAY_LABELS = {
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
};

const teacherAttendanceHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const linked = await getLinkedUser(msg.from.id);

  if (!linked || linked.role !== ROLES.TEACHER) {
    await bot.sendMessage(chatId, "Bu funksiya faqat o'qituvchilar uchun.");
    return;
  }

  const today = localTodayMidnight();
  const todayDow = localDayOfWeek();
  const groups = await listForTeacher(linked._id);

  const todayGroups = groups.filter((g) =>
    // Bugun amal qilayotgan jadval versiyasi (versiyalash)
    scheduleActiveOn(g.schedule, today).some((s) => s.day === todayDow),
  );

  if (todayGroups.length === 0) {
    await bot.sendMessage(
      chatId,
      `Bugun (${DAY_LABELS[todayDow]}) sizning guruhlaringizda dars yo'q.`,
    );
    return;
  }

  const lines = [`Bugun (${DAY_LABELS[todayDow]}) darslari:`];
  for (const g of todayGroups) {
    const data = await listForGroupOnDate(g._id, today);
    const total = data.rows.length;
    const marked = data.rows.filter((r) => r.attendance).length;
    lines.push(
      `\n• ${g.name}\n  Belgilangan: ${marked}/${total}\n  Belgilash uchun tizimga kiring`,
    );
  }

  await bot.sendMessage(chatId, lines.join("\n"));
};

export default teacherAttendanceHandler;
