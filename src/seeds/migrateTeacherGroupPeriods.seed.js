import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import Group from "../models/group.model.js";
import TeacherGroupPeriod from "../models/teacherGroupPeriod.model.js";
import { toUtcMidnight } from "../helpers/attendance.helper.js";

// Bir martalik migratsiya: Group.teachers[] (tarixsiz massiv) dan KUN-darajali
// TeacherGroupPeriod davrlarini yaratadi. startDate = guruh boshlanish sanasi (yoki
// yaratilgan sana); guruh "finished" bo'lsa endDate = finishedAt+1 kun (EXCLUSIVE),
// aks holda ochiq (null). Idempotent: juftlik uchun davr bo'lsa o'tkazib yuboradi.
const DAY = 24 * 60 * 60 * 1000;

const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  const groups = await Group.find(
    { isDeleted: { $ne: true } },
    { teachers: 1, startDate: 1, finishedAt: 1, status: 1, createdAt: 1 },
  ).lean();

  let created = 0;
  let skipped = 0;
  for (const g of groups) {
    const start = g.startDate
      ? toUtcMidnight(g.startDate)
      : toUtcMidnight(g.createdAt || new Date());
    const endExclusive =
      g.status === "finished" && g.finishedAt
        ? new Date(toUtcMidnight(g.finishedAt).getTime() + DAY)
        : null;

    for (const teacher of g.teachers || []) {
      const has = await TeacherGroupPeriod.findOne({
        teacher,
        group: g._id,
        isDeleted: { $ne: true },
      }).lean();
      if (has) {
        skipped += 1;
        continue;
      }
      await TeacherGroupPeriod.create({
        teacher,
        group: g._id,
        startDate: start,
        endDate: endExclusive,
      });
      created += 1;
    }
  }

  logger.info({ groups: groups.length, created, skipped }, "TeacherGroupPeriod migratsiya");
  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`O'qituvchi davrlari migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "O'qituvchi davrlari migratsiya xato");
  process.exit(1);
});
