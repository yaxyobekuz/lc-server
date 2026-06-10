import { getLinkedUser } from "../services/botUser.service.js";
import { ROLES } from "../../constants/roles.js";
import {
  listForTeacher,
  findAllActiveForStudent,
} from "../../modules/groups/services/groups.service.js";
import { scheduleActiveOn } from "../../helpers/attendance.helper.js";

const DAY_NAMES_UZ = [
  "Yakshanba",
  "Dushanba",
  "Seshanba",
  "Chorshanba",
  "Payshanba",
  "Juma",
  "Shanba",
];

// Mongo schedule.day formati: 'mon', 'tue', ...
// JS Date.getUTCDay(): Sunday=0, Monday=1, ...
const DAY_KEY_BY_INDEX = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

const MONTH_NAMES_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentyabr",
  "oktyabr",
  "noyabr",
  "dekabr",
];

// Joriy haftaning Dushanba sanasi (UTC midnight)
const getMondayOfThisWeek = (now = new Date()) => {
  const utcDow = now.getUTCDay(); // 0=Yakshanba ... 1=Dushanba
  // Dushanbadan necha kun oldin: agar bugun Yakshanba (0) bo'lsa 6 kun ortga, aks holda dow-1 kun
  const offset = utcDow === 0 ? 6 : utcDow - 1;
  const d = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - offset,
    ),
  );
  return d;
};

const formatSlot = (slot, groupName) =>
  `  • ${slot.startTime}–${slot.endTime} - ${groupName}`;

const buildScheduleText = (groups, monday) => {
  const lines = ["📅 Bu haftaning jadvali:", ""];

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + i);
    const dayKey = DAY_KEY_BY_INDEX[date.getUTCDay()];
    const dayName = DAY_NAMES_UZ[date.getUTCDay()];
    const dateLabel = `${date.getUTCDate()}-${MONTH_NAMES_UZ[date.getUTCMonth()]}`;

    // Bu kunga mos slotlar (shu sanada amal qilgan jadval versiyasidan - versiyalash)
    const slots = [];
    for (const g of groups) {
      for (const s of scheduleActiveOn(g.schedule, date)) {
        if (s.day === dayKey) {
          slots.push({ ...s, groupName: g.name });
        }
      }
    }
    slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (slots.length === 0) {
      lines.push(`${dayName} (${dateLabel}): dars yo'q`);
    } else {
      lines.push(`${dayName} (${dateLabel}):`);
      for (const s of slots) lines.push(formatSlot(s, s.groupName));
    }
  }
  return lines.join("\n");
};

const scheduleHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const linked = await getLinkedUser(msg.from.id);

  if (!linked) {
    await bot.sendMessage(chatId, "Avval /start ni bosing va telefon raqamingizni yuboring.");
    return;
  }

  let groups = [];
  if (linked.role === ROLES.STUDENT) {
    groups = await findAllActiveForStudent(linked._id);
  } else if (linked.role === ROLES.TEACHER) {
    groups = await listForTeacher(linked._id);
  } else {
    await bot.sendMessage(chatId, "Bu funksiya o'qituvchi va o'quvchilar uchun.");
    return;
  }

  if (!groups.length) {
    await bot.sendMessage(chatId, "Hozircha sizga biriktirilgan guruhlar yo'q.");
    return;
  }

  const monday = getMondayOfThisWeek();
  const text = buildScheduleText(groups, monday);
  await bot.sendMessage(chatId, text);
};

export default scheduleHandler;
