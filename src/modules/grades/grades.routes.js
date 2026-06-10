import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import requirePermissionOrSelf from "../../middleware/requirePermissionOrSelf.js";
import {
  requireGroupAccess,
  requireStudentAccess,
} from "../../middleware/attendanceScope.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  bulkRecordSchema,
  listForDateSchema,
  groupRangeSchema,
  studentRangeSchema,
  leaderboardSchema,
  ratingSettingsUpdateSchema,
} from "./validators/grades.validator.js";

import listForGroupOnDate from "./handlers/listForGroupOnDate.handler.js";
import bulkRecord from "./handlers/bulkRecord.handler.js";
import groupSummary from "./handlers/groupSummary.handler.js";
import studentSummary from "./handlers/studentSummary.handler.js";
import leaderboard from "./handlers/leaderboard.handler.js";
import studentRank from "./handlers/studentRank.handler.js";
import {
  getRatingSettings,
  updateRatingSettings,
} from "./handlers/ratingSettings.handler.js";

const router = Router();

// ─── Reyting ───
router.get(
  "/rating/leaderboard",
  requireAuth,
  requirePermission(PERMISSIONS.RATING_READ),
  validate(leaderboardSchema),
  leaderboard,
);

router.get(
  "/rating/settings",
  requireAuth,
  requirePermission(PERMISSIONS.RATING_READ),
  getRatingSettings,
);

router.patch(
  "/rating/settings",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.RATING_MANAGE),
  validate(ratingSettingsUpdateSchema),
  updateRatingSettings,
);

// O'quvchining reytingdagi o'rni (umumiy + guruh) - o'zi yoki ruxsatli
router.get(
  "/rating/students/:id",
  requireAuth,
  requirePermissionOrSelf(PERMISSIONS.RATING_READ, (req) => req.params.id),
  studentRank,
);

// O'quvchining o'rtacha balli + oxirgi ballar (o'zi yoki ruxsatli)
router.get(
  "/students/:id/summary",
  requireAuth,
  requirePermissionOrSelf(PERMISSIONS.GRADES_READ, (req) => req.params.id),
  requireStudentAccess((req) => req.params.id),
  validate(studentRangeSchema),
  studentSummary,
);

// Guruh summary (o'rtacha + tarqalish)
router.get(
  "/groups/:groupId/summary",
  requireAuth,
  requirePermission(PERMISSIONS.GRADES_READ),
  requireGroupAccess(),
  validate(groupRangeSchema),
  groupSummary,
);

// Guruh + sana uchun baholash ro'yxati
router.get(
  "/groups/:groupId",
  requireAuth,
  requirePermission(PERMISSIONS.GRADES_READ),
  requireGroupAccess(),
  validate(listForDateSchema),
  listForGroupOnDate,
);

// Ballarni bulk saqlash
router.post(
  "/groups/:groupId/bulk",
  requireAuth,
  requirePermission(PERMISSIONS.GRADES_RECORD),
  requireGroupAccess(),
  validate(bulkRecordSchema),
  bulkRecord,
);

export default router;
