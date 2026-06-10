import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import Attendance from "../models/attendance.model.js";

// Bir martalik migratsiya: davomatga "slot" maydoni qo'shildi (kunda bir nechta dars).
// 1) Mavjud yozuvlarga slot="" (bir slotli kun) o'rnatiladi.
// 2) Eski unique indeks (group,student,dateKey) o'chiriladi (Mongoose avto-drop qilmaydi).
// 3) Yangi slot-aware indeks yaratiladi (syncIndexes).
const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  const res = await Attendance.updateMany(
    { slot: { $exists: false } },
    { $set: { slot: "" } },
  );
  logger.info({ modified: res.modifiedCount || 0 }, "slot='' backfill bajarildi");

  // Eski indeksni o'chirish (mavjud bo'lmasa - e'tiborsiz)
  try {
    await Attendance.collection.dropIndex("group_1_student_1_dateKey_1");
    logger.info("Eski unique indeks (group,student,dateKey) o'chirildi");
  } catch (err) {
    logger.info(
      { msg: err?.message },
      "Eski indeks topilmadi yoki allaqachon o'chirilgan",
    );
  }

  // Yangi indekslarni (slot-aware unique) yaratish
  await Attendance.syncIndexes();
  logger.info("Indekslar sinxronlandi (slot-aware unique)");

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`Attendance slot migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "Attendance slot migratsiya xato");
  process.exit(1);
});
