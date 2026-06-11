import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import User from "../models/user.model.js";
import { ROLES } from "../constants/roles.js";
import { hashPassword } from "../helpers/password.helper.js";
import logger from "../config/logger.js";

// Default owner user. Parol production'da MAJBURIY ravishda OWNER_PASSWORD
// env'dan olinadi - "owner123" default'i bilan production'ga seed qilib
// bo'lmaydi (to'liq super-admin huquqli akkaunt!).
const OWNER = {
  username: "owner",
  firstName: "Bosh",
  lastName: "Ega",
};

const resolvePassword = () => {
  const fromEnv = process.env.OWNER_PASSWORD;
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Production'da OWNER_PASSWORD env (kamida 8 belgi) majburiy - default parol bilan seed qilinmaydi",
    );
  }
  return "owner123"; // faqat development
};

const seed = async () => {
  await connectDB();

  const exists = await User.findOne({ username: OWNER.username });
  if (exists) {
    logger.info("Owner mavjud, o'tkazib yuborildi");
  } else {
    const password = resolvePassword();
    const passwordHash = await hashPassword(password);
    await User.create({
      firstName: OWNER.firstName,
      lastName: OWNER.lastName,
      username: OWNER.username,
      passwordHash,
      role: ROLES.OWNER,
      isActive: true,
    });
    logger.info(`Owner yaratildi (login: ${OWNER.username})`);
  }

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Owner seed xato");
  process.exit(1);
});
