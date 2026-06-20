import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import Group from "../models/group.model.js";
import * as groupsService from "../modules/groups/services/groups.service.js";
import { toUtcMidnight, localTodayMidnight } from "../helpers/attendance.helper.js";

// Bir martalik migratsiya: eski hayot-tsikl (status/finishedAt/archivedAt) →
// yagona endDate modeli. Tugagan (finished) yoki arxivlangan (isActive=false)
// guruhlarga endDate beradi, obsolete maydonlarni o'chiradi, reconcile qiladi
// (o'qituvchi davri + o'quvchi a'zoliklari endDate'da yopiladi). Idempotent.
const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  // lean() saqlangan RAW hujjatni qaytaradi - sxemadan olib tashlangan
  // finishedAt/archivedAt/status maydonlari ham keladi.
  const groups = await Group.find({ isDeleted: { $ne: true } }).lean();

  let updated = 0;
  for (const g of groups) {
    const legacyEnd = g.finishedAt || g.archivedAt || null;
    let endDate = g.endDate ? toUtcMidnight(g.endDate) : null;
    if (!endDate && legacyEnd) endDate = toUtcMidnight(legacyEnd);
    // Sanasiz arxivlangan (eski) → bugun bilan tugagan deb belgilaymiz.
    if (!endDate && g.isActive === false) endDate = localTodayMidnight();

    const set = {};
    if (endDate) set.endDate = endDate;

    await Group.updateOne(
      { _id: g._id },
      {
        ...(Object.keys(set).length ? { $set: set } : {}),
        $unset: { status: "", finishedAt: "", archivedAt: "" },
      },
    );

    if (endDate) {
      const doc = await Group.findById(g._id);
      await groupsService.reconcileGroupEnd(doc);
      updated += 1;
    }
  }

  logger.info({ groups: groups.length, updated }, "Group endDate migratsiya");
  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`Guruh endDate migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "Guruh endDate migratsiya xato");
  process.exit(1);
});
