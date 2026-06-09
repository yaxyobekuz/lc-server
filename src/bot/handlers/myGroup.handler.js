import { getLinkedUser } from "../services/botUser.service.js";
import * as groupsService from "../../modules/groups/services/groups.service.js";
import { ROLES } from "../../constants/roles.js";
import { formatSchedule } from "../utils/format.js";

const myGroupHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const linked = await getLinkedUser(msg.from.id);

  if (!linked || linked.role !== ROLES.STUDENT) {
    await bot.sendMessage(chatId, "Bu funksiya faqat o'quvchilar uchun.");
    return;
  }

  const data = await groupsService.findActiveForStudent(linked._id);
  if (!data) {
    await bot.sendMessage(chatId, "Hozircha hech qaysi guruhga biriktirilmagansiz.");
    return;
  }

  const { group } = data;
  const teachers = (group.teachers || [])
    .map((t) => `${t.firstName} ${t.lastName}`)
    .join(", ") || "-";

  const text = [
    `Guruh: ${group.name}`,
    `Dars kunlari: ${formatSchedule(group.schedule)}`,
    `O'qituvchilar: ${teachers}`,
  ].join("\n");

  await bot.sendMessage(chatId, text);
};

export default myGroupHandler;
