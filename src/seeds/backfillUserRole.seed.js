import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import User from "../models/user.model.js";
import { ROLES, ALL_ROLES } from "../constants/roles.js";

// Bir martalik migratsiya: rol majburiy bo'lib qoldi.
// `role` maydoni rol enumiga kirmaydigan (yo'q / null / "" / noma'lum)
// barcha foydalanuvchilarga student roli o'rnatiladi - panelda
// "rolsiz foydalanuvchi" qolmasligi uchun.
const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  const res = await User.updateMany(
    { role: { $nin: ALL_ROLES } },
    { $set: { role: ROLES.STUDENT } },
  );

  logger.info(
    { modified: res.modifiedCount || 0 },
    "Rolsiz foydalanuvchilarga student roli o'rnatildi",
  );

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`User role backfill migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "User role backfill migratsiya xato");
  process.exit(1);
});
