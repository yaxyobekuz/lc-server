import mongoose from "mongoose";
import env from "./env.js";
import logger from "./logger.js";

mongoose.set("strictQuery", true);

// BotUser.user maydonidagi ESKIRGAN unique indeksni o'chiradi.
// Sabab: ilgari `user` da sparse-unique indeks bor edi; u `user: null` qiymatlarda
// E11000 berib, login+parol bilan Telegram bog'lanishini buzardi. Schema endi
// uniqueликsiz (last-login-wins), lekin Mongoose autoIndex eski indeksni O'CHIRMAYDI.
// Shu sabab har ishga tushishda bir marta tekshirib, eskirgan unique indeksni olib tashlaymiz.
const cleanupStaleBotUserIndex = async () => {
  try {
    const indexes = await mongoose.connection
      .collection("botusers")
      .indexes();
    const staleUserIdx = indexes.find(
      (i) => i.name === "user_1" && i.unique === true,
    );
    if (staleUserIdx) {
      await mongoose.connection.collection("botusers").dropIndex("user_1");
      logger.warn("Eskirgan BotUser.user unique indeks o'chirildi (boot tozalash)");
    }
  } catch (err) {
    // Kolleksiya hali yo'q yoki indeks topilmadi - e'tiborsiz, server ishlashda davom etsin
    logger.info({ msg: err?.message }, "BotUser indeks tozalash o'tkazib yuborildi");
  }
};

export const connectDB = async () => {
  await mongoose.connect(env.MONGO_URL);
  logger.info("MongoDB ulandi");
  await cleanupStaleBotUserIndex();
};

export const disconnectDB = async () => {
  await mongoose.disconnect();
  logger.info("MongoDB uzildi");
};
