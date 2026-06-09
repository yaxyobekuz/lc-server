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

  // Create every role; permissions stay empty unless attached manually.
  // Owner permissions are reset on every seed so newly added permission keys
  // are automatically attached.
  const labels = { owner: "Egasi", teacher: "O'qituvchi", student: "O'quvchi" };
  for (const value of ALL_ROLES) {
    if (value === ROLES.OWNER) {
      await Role.findOneAndUpdate(
        { value },
        {
          $setOnInsert: { value, label: labels[value] },
          $set: { permissions: Object.values(permIds) },
        },
        { upsert: true, new: true },
      );
    } else if (value === ROLES.TEACHER) {
      // Teacher: default permissionlarni har seedda qo'shamiz (mavjudlarini buzmaymiz)
      const teacherDefaults = [
        permIds[PERMISSIONS.GROUPS_READ],
        permIds[PERMISSIONS.USERS_READ],
        permIds[PERMISSIONS.ATTENDANCE_READ],
        permIds[PERMISSIONS.ATTENDANCE_RECORD],
        permIds[PERMISSIONS.GRADES_READ],
        permIds[PERMISSIONS.GRADES_RECORD],
        permIds[PERMISSIONS.RATING_READ],
        permIds[PERMISSIONS.NOTIFICATIONS_SEND],
      ].filter(Boolean);
      await Role.findOneAndUpdate(
        { value },
        {
          $setOnInsert: { value, label: labels[value] },
          $addToSet: { permissions: { $each: teacherDefaults } },
        },
        { upsert: true, new: true },
      );
    } else {
      // Student: reytingni ko'rishi mumkin (faqat o'qish). Har seedda qo'shamiz.
      const studentDefaults = [permIds[PERMISSIONS.RATING_READ]].filter(Boolean);
      await Role.findOneAndUpdate(
        { value },
        {
          $setOnInsert: { value, label: labels[value] },
          $addToSet: { permissions: { $each: studentDefaults } },
        },
        { upsert: true, new: true },
      );
    }
  }
  logger.info("Rollar seed qilindi");

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Seed xato");
  process.exit(1);
});
