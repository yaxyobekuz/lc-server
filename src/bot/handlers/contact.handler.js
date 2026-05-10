import { linkByPhone } from "../services/botUser.service.js";
import { mainMenuFor } from "../keyboards/main.keyboard.js";

const contactHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;

  if (!contact || !contact.phone_number) {
    await bot.sendMessage(chatId, "Telefon raqam topilmadi. Qayta urinib ko'ring.");
    return;
  }

  // Faqat o'z kontaktini qabul qilamiz (boshqa odamning kontaktini emas)
  if (contact.user_id && contact.user_id !== msg.from.id) {
    await bot.sendMessage(chatId, "Iltimos, o'zingizning telefon raqamingizni yuboring.");
    return;
  }

  const user = await linkByPhone(msg.from.id, contact.phone_number);

  if (!user) {
    await bot.sendMessage(
      chatId,
      "Bu telefon raqam ro'yxatda topilmadi. Iltimos, administrator bilan bog'laning.",
    );
    return;
  }

  await bot.sendMessage(
    chatId,
    `Profilingiz bog'landi. Xush kelibsiz, ${user.firstName}!`,
    mainMenuFor(user.role),
  );
};

export default contactHandler;
