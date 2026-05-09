const helpHandler = async (bot, msg) => {
  const text = [
    "Mavjud buyruqlar:",
    "/start — botni qayta ishga tushirish",
    "/help — yordam",
    "",
    "Savollar bo'lsa administrator bilan bog'laning.",
  ].join("\n");
  await bot.sendMessage(msg.chat.id, text);
};

export default helpHandler;
