import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import User from "../models/user.model.js";
import logger from "../config/logger.js";

// XAVFSIZLIK MIGRATSIYASI: bazada ochiq matnda saqlangan parollarni (legacy
// plainPassword maydoni) butunlay o'chiradi. Schema'dan maydon olib tashlangan,
// lekin eski hujjatlardagi qiymatlar diskda qolgan - bu skript ularni tozalaydi.
const seed = async () => {
  await connectDB();

  const res = await User.updateMany(
    { plainPassword: { $exists: true } },
    { $unset: { plainPassword: "" } },
    { strict: false },
  );
  logger.info(
    `plainPassword tozalandi: ${res.modifiedCount} ta foydalanuvchi yangilandi`,
  );

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "plainPassword tozalash migratsiyasi xato");
  process.exit(1);
});
