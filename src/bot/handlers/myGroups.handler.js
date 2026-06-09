import { getLinkedUser } from "../services/botUser.service.js";
import * as groupsService from "../../modules/groups/services/groups.service.js";
import { ROLES } from "../../constants/roles.js";
import { formatSchedule } from "../utils/format.js";

const myGroupsHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const linked = await getLinkedUser(msg.from.id);

  if (!linked || linked.role !== ROLES.TEACHER) {
    await bot.sendMessage(chatId, "Bu funksiya faqat o'qituvchilar uchun.");
    return;
  }

  const groups = await groupsService.listForTeacher(linked._id);
  if (!groups || groups.length === 0) {
    await bot.sendMessage(chatId, "Sizga biriktirilgan guruhlar yo'q.");
    return;
  }

  const lines = ["Sizning guruhlaringiz:"];
  const buttons = [];
  groups.forEach((g, i) => {
    lines.push(
      [
        `${i + 1}) ${g.name} - ${g.studentsCount || 0} o'quvchi`,
        `   Dars: ${formatSchedule(g.schedule)}`,
      ].join("\n"),
    );
    buttons.push([
      { text: `${g.name} - o'quvchilar`, callback_data: `students:${g._id}` },
    ]);
  });

  await bot.sendMessage(chatId, lines.join("\n\n"), {
    reply_markup: { inline_keyboard: buttons },
  });
};

export default myGroupsHandler;
