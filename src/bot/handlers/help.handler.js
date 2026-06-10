const HELP = [
  "Bayyina o'quv markazi boti.",
  "",
  "Tizimga kirish uchun /start ni bosing va paydo bo'lgan",
  "\"🔐 Tizimga kirish\" tugmasini bosing - barcha imkoniyatlar mini ilova ichida.",
  "",
  "Buyruqlar:",
  "• /start - botni qayta ishga tushirish",
];

const helpHandler = async (bot, msg) => {
  await bot.sendMessage(msg.chat.id, HELP.join("\n"));
};

export default helpHandler;
