import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import User from "../models/user.model.js";
import { ROLES } from "../constants/roles.js";
import { recomputeStudentCompletion } from "../helpers/studentCompletion.helper.js";

// Bir martalik migratsiya: mavjud o'quvchilarga "yakunlash sanasi" (completedAt)
// ni to'ldiradi. Helper mantig'ini qayta ishlatadi:
//  - arxivlangan o'quvchilar → completedAt = archivedAt
//  - arxivlanmagan, faol a'zoligi yo'q o'quvchilar → eng oxirgi leftAt
//  - faol a'zoligi bor / a'zoligi yo'q → null (o'zgarmaydi)
// completedAtManual=true bo'lganlar (qo'lda kiritilgan) tegilmaydi.
const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  const students = await User.find({
    role: ROLES.STUDENT,
    isDeleted: { $ne: true },
  })
    .select("_id")
    .lean();

  let updated = 0;
  for (const s of students) {
    const before = await User.findById(s._id).select("completedAt").lean();
    await recomputeStudentCompletion(s._id);
    const after = await User.findById(s._id).select("completedAt").lean();
    const b = before?.completedAt ? new Date(before.completedAt).getTime() : null;
    const a = after?.completedAt ? new Date(after.completedAt).getTime() : null;
    if (b !== a) updated += 1;
  }

  logger.info(
    { total: students.length, updated },
    "O'quvchilar completedAt backfill tayyor",
  );

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`completedAt backfill migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "completedAt backfill migratsiya xato");
  process.exit(1);
});
