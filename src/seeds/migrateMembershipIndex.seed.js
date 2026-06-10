import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import GroupMembership from "../models/groupMembership.model.js";

// Bir martalik migratsiya: (group, student) unique partial indeksi endi isDeleted ni
// ham hisobga oladi. Avval soft-delete qilingan, lekin leftAt=null bo'lib qolgan
// "osilib qolgan" a'zoliklar active slotni band qilib turardi - shu sabab o'quvchini
// guruhga qayta qo'shib/ko'chirib bo'lmasdi va guruh ichida ko'rinmay qolardi.
//
// 1) Soft-delete qilingan, lekin leftAt=null yozuvlarga leftAt=deletedAt o'rnatamiz
//    (slotni bo'shatish uchun).
// 2) Eski indeksni o'chiramiz (Mongoose partial filter o'zgarishini avto-yangilamaydi).
// 3) syncIndexes - yangi (leftAt:null, isDeleted:false) partial unique indeks yaratiladi.
const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  // 1) Osilib qolgan soft-deleted yozuvlarni yopamiz
  const stale = await GroupMembership.find(
    { isDeleted: true, leftAt: null },
    { _id: 1, deletedAt: 1, updatedAt: 1 },
  ).lean();
  let fixed = 0;
  for (const m of stale) {
    const leftAt = m.deletedAt || m.updatedAt || new Date();
    await GroupMembership.collection.updateOne(
      { _id: m._id },
      { $set: { leftAt, leftReason: "removed" } },
    );
    fixed += 1;
  }
  logger.info({ fixed }, "Osilib qolgan soft-deleted a'zoliklar yopildi");

  // 2) Eski indeksni o'chirish (mavjud bo'lmasa - e'tiborsiz)
  try {
    await GroupMembership.collection.dropIndex("group_1_student_1");
    logger.info("Eski (group,student) partial unique indeks o'chirildi");
  } catch (err) {
    logger.info(
      { msg: err?.message },
      "Eski indeks topilmadi yoki allaqachon o'chirilgan",
    );
  }

  // 3) Yangi indekslarni yaratish
  await GroupMembership.syncIndexes();
  logger.info("Indekslar sinxronlandi (leftAt:null, isDeleted:false partial unique)");

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`Membership indeks migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "Membership indeks migratsiya xato");
  process.exit(1);
});
