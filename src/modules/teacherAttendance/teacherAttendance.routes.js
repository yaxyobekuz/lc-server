import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listForDateSchema,
  bulkRecordSchema,
} from "./validators/teacherAttendance.validator.js";
import listForDate from "./handlers/listForDate.handler.js";
import bulkRecord from "./handlers/bulkRecord.handler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(listForDateSchema),
  listForDate,
);

router.post(
  "/bulk",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_RECORD),
  validate(bulkRecordSchema),
  bulkRecord,
);

export default router;
