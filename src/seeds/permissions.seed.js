import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import Permission from "../models/permission.model.js";
import Role from "../models/role.model.js";
import { PERMISSIONS, PERMISSION_LABELS } from "../constants/permissions.js";
import { ALL_ROLES, ROLES } from "../constants/roles.js";
import logger from "../config/logger.js";

const seed = async () => {
  await connectDB();

  // Permissions upsert
  const permIds = {};
  for (const key of Object.values(PERMISSIONS)) {
    const meta = PERMISSION_LABELS[key] || { label: key, group: "general" };
    const doc = await Permission.findOneAndUpdate(
      { key },
      { $set: { label: meta.label, group: meta.group } },
      { upsert: true, new: true },
    );
    permIds[key] = doc._id;
  }
  logger.info(`Permissions seed qilindi: ${Object.keys(permIds).length}`);

  // Create every role; permissions stay empty unless attached manually
  // Owner gets every permission via the code-base rule, not via this list
  const labels = { owner: "Egasi", teacher: "O'qituvchi", student: "O'quvchi" };
  for (const value of ALL_ROLES) {
    await Role.findOneAndUpdate(
      { value },
      {
        $setOnInsert: {
          value,
          label: labels[value],
          permissions:
            value === ROLES.OWNER ? Object.values(permIds) : [],
        },
      },
      { upsert: true, new: true },
    );
  }
  logger.info("Rollar seed qilindi");

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Seed xato");
  process.exit(1);
});
