import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import requirePermissionOrSelf from "../../middleware/requirePermissionOrSelf.js";
import {
  requireGroupAccess,
  requireStudentAccess,
} from "../../middleware/attendanceScope.js";
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

const router = Router();

// Teacher uchun maxsus (o'z guruhlari summary'si - handler ichida scope qilinadi)
router.get("/teacher/me/summary", requireAuth, validate(rangeQuerySchema), teacherSummary);

// Markaz miqyosidagi hisobotlar - FAQAT boshqaruv ruxsati (owner). Oddiy
// ATTENDANCE_READ (o'qituvchilarda bor) markaz-bo'ylab ma'lumotga yo'l ochmasin.
router.get(
  "/dashboard",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  validate(rangeQuerySchema),
  dashboard,
);

router.get(
  "/students/:id/monthly",
  requireAuth,
  requirePermissionOrSelf(PERMISSIONS.ATTENDANCE_READ, (req) => req.params.id),
  requireStudentAccess((req) => req.params.id),
  validate(studentMonthlySchema),
  studentMonthly,
);

router.get(
  "/students/:id/yearly",
  requireAuth,
  requirePermissionOrSelf(PERMISSIONS.ATTENDANCE_READ, (req) => req.params.id),
  requireStudentAccess((req) => req.params.id),
  validate(studentYearSchema),
  studentYear,
);

router.get(
  "/students/:id/summary",
  requireAuth,
  requirePermissionOrSelf(PERMISSIONS.ATTENDANCE_READ, (req) => req.params.id),
  requireStudentAccess((req) => req.params.id),
  validate(studentRangeSchema),
  studentSummary,
);

router.get(
  "/groups/:groupId/summary",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  requireGroupAccess(),
  validate(groupRangeSchema),
  groupSummary,
);

router.get(
  "/groups/:groupId/monthly",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  requireGroupAccess(),
  validate(groupMonthlySchema),
  groupMonthly,
);

router.get(
  "/groups/:groupId",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  requireGroupAccess(),
  validate(listForDateSchema),
  listForGroupOnDate,
);

router.post(
  "/groups/:groupId/bulk",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_RECORD),
  requireGroupAccess(),
  validate(bulkRecordSchema),
  bulkRecord,
);

// O'qituvchi davomati (keldi/kelmadi) - faqat FAKT belgisi, pulga avtomatik
// ta'sir qilmaydi (faqat hisobot/kuzatuv uchun).
router.get(
  "/groups/:groupId/teacher",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  requireGroupAccess(),
  validate(teacherStatusSchema),
  teacherAttendanceStatus,
);

// MUHIM: ATTENDANCE_MANAGE (owner-darajali) - oddiy o'qituvchi O'ZINING
// "kelmadi" belgisini o'chira olmasligi kerak (hisobot dalili yo'qolardi).
// teacherAttendance moduli (manba-haqiqat) bilan bir xil darajada qo'riqlanadi.
router.post(
  "/groups/:groupId/teacher",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  requireGroupAccess(),
  validate(teacherSetSchema),
  teacherAttendanceSet,
);

export default router;
