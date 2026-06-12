import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import BotUser from "../models/botUser.model.js";

// Bir martalik migratsiya: BotUser.user uniqueligi endi `sparse` emas, `partial`.
//
// Muammo: `user` maydonida `sparse: true` unique indeks bor edi, schema esa
// `default: null` qo'yardi. `sparse` indeks `null` ni "yo'q" deb HISOBLAMAYDI -
// shu sabab faqat BITTA hujjat `user: null` bo'la olardi. Ikkinchi bog'lanmagan
// (yoki bog'lanishi uzilgan) BotUser yaratilganda E11000 duplicate key xato chiqib,
// login+parol bilan kirishda Telegram ID akkauntga BOG'LANMASDI.
//
// Yechim: uniquelik faqat user mavjud (objectId) bo'lganda tekshirilsin.
// 1) Eski `user_1` (sparse) indeksni o'chiramiz.
// 2) syncIndexes - yangi partial unique indeks yaratiladi.
const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  // 1) Eski indeksni o'chirish (mavjud bo'lmasa - e'tiborsiz)
  try {
    await BotUser.collection.dropIndex("user_1");
    logger.info("Eski user_1 (sparse) unique indeks o'chirildi");
  } catch (err) {
    logger.info(
      { msg: err?.message },
      "Eski user_1 indeks topilmadi yoki allaqachon o'chirilgan",
    );
  }

  // 2) Yangi indekslarni yaratish (partial unique: user $type objectId)
  await BotUser.syncIndexes();
  logger.info("BotUser indekslari sinxronlandi (user partial unique)");

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`BotUser indeks migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "BotUser indeks migratsiya xato");
  process.exit(1);
});
