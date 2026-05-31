import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { bulkRecordSchema } from "./validators/bulkRecord.validator.js";
import { listForDateSchema } from "./validators/listForDate.validator.js";
import {
  studentMonthlySchema,
  studentYearSchema,
} from "./validators/studentMonthly.validator.js";
import { groupMonthlySchema } from "./validators/groupMonthly.validator.js";
import {
  rangeQuerySchema,
  studentRangeSchema,
  groupRangeSchema,
} from "./validators/range.validator.js";
import { correlationSchema } from "./validators/correlation.validator.js";
import {
  teacherStatusSchema,
  teacherSetSchema,
} from "./validators/teacherAttendance.validator.js";

import listForGroupOnDate from "./handlers/listForGroupOnDate.handler.js";
import bulkRecord from "./handlers/bulkRecord.handler.js";
import teacherAttendanceStatus from "./handlers/teacherAttendanceStatus.handler.js";
import teacherAttendanceSet from "./handlers/teacherAttendanceSet.handler.js";
import studentMonthly from "./handlers/studentMonthly.handler.js";
import studentYear from "./handlers/studentYear.handler.js";
import groupMonthly from "./handlers/groupMonthly.handler.js";
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
  "/students/:id/yearly",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(studentYearSchema),
  studentYear,
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
  "/groups/:groupId/monthly",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(groupMonthlySchema),
  groupMonthly,
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

// O'qituvchi davomati (keldi/kelmadi) — kelmagan kun uchun o'quvchilarga dars haqi qaytariladi
router.get(
  "/groups/:groupId/teacher",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(teacherStatusSchema),
  teacherAttendanceStatus,
);

router.post(
  "/groups/:groupId/teacher",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_RECORD),
  validate(teacherSetSchema),
  teacherAttendanceSet,
);

export default router;
