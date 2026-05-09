import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import User from "../models/user.model.js";
import { ROLES } from "../constants/roles.js";
import { hashPassword } from "../helpers/password.helper.js";
import logger from "../config/logger.js";

// Default owner user — DEVELOPMENT ONLY
const OWNER = {
  username: "owner",
  firstName: "Bosh",
  lastName: "Ega",
  password: "owner123",
};

const seed = async () => {
  await connectDB();

  const exists = await User.findOne({ username: OWNER.username });
  if (exists) {
    logger.info("Owner mavjud, o'tkazib yuborildi");
  } else {
    const passwordHash = await hashPassword(OWNER.password);
    await User.create({
      firstName: OWNER.firstName,
      lastName: OWNER.lastName,
      username: OWNER.username,
      passwordHash,
      role: ROLES.OWNER,
      isActive: true,
    });
    logger.info(
      `Owner yaratildi (login: ${OWNER.username}, parol: ${OWNER.password})`,
    );
  }

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Owner seed xato");
  process.exit(1);
});
