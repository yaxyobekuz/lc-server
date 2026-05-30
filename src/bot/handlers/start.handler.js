import env from "../../config/env.js";

const startHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const name = msg.from?.first_name || "foydalanuvchi";

  await bot.sendMessage(
    chatId,
    [
      `Assalomu alaykum, ${name}!`,
      "",
      '"Bayyina" o\'quv markazi tizimiga xush kelibsiz.',
      "Davom etish uchun pastdagi tugmani bosing.",
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔐 Tizimga kirish",
              web_app: { url: env.TELEGRAM_BOT_WEBAPP_URL },
            },
          ],
        ],
      },
    },
  );
};

export default startHandler;
