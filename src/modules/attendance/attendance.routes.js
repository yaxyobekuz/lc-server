import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { bulkRecordSchema } from "./validators/bulkRecord.validator.js";
import { listForDateSchema } from "./validators/listForDate.validator.js";
import { studentMonthlySchema } from "./validators/studentMonthly.validator.js";
import {
  rangeQuerySchema,
  studentRangeSchema,
  groupRangeSchema,
} from "./validators/range.validator.js";
import { correlationSchema } from "./validators/correlation.validator.js";

import listForGroupOnDate from "./handlers/listForGroupOnDate.handler.js";
import bulkRecord from "./handlers/bulkRecord.handler.js";
import studentMonthly from "./handlers/studentMonthly.handler.js";
import studentSummary from "./handlers/studentSummary.handler.js";
import groupSummary from "./handlers/groupSummary.handler.js";
import teacherSummary from "./handlers/teacherSummary.handler.js";
import dashboard from "./handlers/dashboard.handler.js";
import correlation from "./handlers/correlation.handler.js";

const router = Router();

// Teacher uchun maxsus
router.get("/teacher/me/summary", requireAuth, validate(rangeQuerySchema), teacherSummary);

router.get(
  "/dashboard",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(rangeQuerySchema),
  dashboard,
);

router.get(
  "/correlation",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(correlationSchema),
  correlation,
);

router.get(
  "/students/:id/monthly",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(studentMonthlySchema),
  studentMonthly,
);

router.get(
  "/students/:id/summary",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(studentRangeSchema),
  studentSummary,
);

router.get(
  "/groups/:groupId/summary",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(groupRangeSchema),
  groupSummary,
);

router.get(
  "/groups/:groupId",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(listForDateSchema),
  listForGroupOnDate,
);

router.post(
  "/groups/:groupId/bulk",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_RECORD),
  validate(bulkRecordSchema),
  bulkRecord,
);

export default router;
