import mongoose from "mongoose";
import env from "./env.js";
import logger from "./logger.js";

mongoose.set("strictQuery", true);

// BotUser kolleksiyasidagi ESKIRGAN unique indekslarni o'chiradi.
// Bitta Telegram endi bir nechta userga bog'lana oladi, shuning uchun quyidagilar
// E11000 berib yangi userni bog'lashga to'sqinlik qiladi - ularni olib tashlaymiz:
//   - user_1        : eski "bitta user -> bitta telegram" unique indeksi
//   - telegramId_1  : eski "bitta telegram -> bitta user" unique indeksi
// Mongoose autoIndex eski indeksni O'CHIRMAYDI - shu sabab har ishga tushishda
// bir marta tekshirib, eskirgan unique indekslarni olib tashlaymiz.
const cleanupStaleBotUserIndex = async () => {
  try {
    const coll = mongoose.connection.collection("botusers");
    const indexes = await coll.indexes();
    for (const name of ["user_1", "telegramId_1"]) {
      const stale = indexes.find((i) => i.name === name && i.unique === true);
      if (stale) {
        await coll.dropIndex(name);
        logger.warn({ index: name }, "Eskirgan BotUser unique indeks o'chirildi (boot tozalash)");
      }
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
