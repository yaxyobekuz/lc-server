import { getLinkedUser } from "../services/botUser.service.js";
import { ROLES } from "../../constants/roles.js";
import { getStudentSummary } from "../../modules/attendance/services/attendance.service.js";
import { localTodayMidnight } from "../../helpers/attendance.helper.js";

const STATUS_EMOJI = {
  present: "✅",
  absent: "❌",
  excused: "🟡",
  exempt: "⚪️",
};

const STATUS_LABEL = {
  present: "Keldi",
  absent: "Kelmadi",
  excused: "Sababli",
  exempt: "Ozod",
};

const myAttendanceHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const linked = await getLinkedUser(msg.from.id);

  if (!linked || linked.role !== ROLES.STUDENT) {
    await bot.sendMessage(chatId, "Bu funksiya faqat o'quvchilar uchun.");
    return;
  }

  const now = localTodayMidnight();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );

  const summary = await getStudentSummary(linked._id, {
    fromDate: monthStart,
    toDate: monthEnd,
  });

  const lines = [
    `Joriy oy davomati:`,
    `Foiz: ${summary.attendanceRate !== null ? summary.attendanceRate + "%" : "-"}`,
    `Jami darslar: ${summary.totalClasses}`,
    `${STATUS_EMOJI.present} ${STATUS_LABEL.present}: ${summary.present}`,
    `${STATUS_EMOJI.absent} ${STATUS_LABEL.absent}: ${summary.absent}`,
    `${STATUS_EMOJI.excused} ${STATUS_LABEL.excused}: ${summary.excused}`,
    `${STATUS_EMOJI.exempt} ${STATUS_LABEL.exempt}: ${summary.exempt}`,
  ];

  await bot.sendMessage(chatId, lines.join("\n"));
};

export default myAttendanceHandler;
