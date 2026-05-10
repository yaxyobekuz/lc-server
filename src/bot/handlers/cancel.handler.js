import { clearFlowState } from "../services/botUser.service.js";

const cancelHandler = async (bot, msg) => {
  await clearFlowState(msg.from.id);
  await bot.sendMessage(msg.chat.id, "Bekor qilindi.");
};

export default cancelHandler;
