import { getLinkedUser } from "../services/botUser.service.js";
import * as groupsService from "../../modules/groups/services/groups.service.js";
import { ROLES } from "../../constants/roles.js";
import { formatPhone } from "../utils/format.js";

const groupStudentsHandler = async (bot, query) => {
  const chatId = query.message?.chat?.id;
  if (!chatId) return;

  const linked = await getLinkedUser(query.from.id);
  if (!linked || linked.role !== ROLES.TEACHER) {
    await bot.answerCallbackQuery(query.id, { text: "Ruxsat yo'q" });
    return;
  }

  const groupId = String(query.data || "").split(":")[1];
  if (!groupId) {
    await bot.answerCallbackQuery(query.id, { text: "Noto'g'ri so'rov" });
    return;
  }

  let group;
  try {
    group = await groupsService.getById(groupId);
  } catch {
    await bot.answerCallbackQuery(query.id, { text: "Guruh topilmadi" });
    return;
  }

  // Xavfsizlik: o'qituvchi shu guruhga biriktirilganini qayta tekshir
  const isOwn = (group.teachers || []).some(
    (t) => String(t._id || t) === String(linked._id),
  );
  if (!isOwn) {
    await bot.answerCallbackQuery(query.id, { text: "Sizga biriktirilmagan" });
    return;
  }

  await bot.answerCallbackQuery(query.id);

  if (!group.students || group.students.length === 0) {
    await bot.sendMessage(chatId, `${group.name} - o'quvchilar yo'q.`);
    return;
  }

  const lines = [`${group.name} - o'quvchilar:`];
  group.students.forEach((s, i) => {
    lines.push(`${i + 1}) ${s.firstName} ${s.lastName} - ${formatPhone(s.phone)}`);
  });

  await bot.sendMessage(chatId, lines.join("\n"));
};

export default groupStudentsHandler;
