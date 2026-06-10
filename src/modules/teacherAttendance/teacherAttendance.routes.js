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

// O'qituvchilarning kelgan/kelmaganini boshqarish - maoshga ta'sir qiladi,
// shuning uchun FAQAT boshqaruv ruxsati (owner). Oddiy o'qituvchi boshqa
// o'qituvchini belgilay olmaydi.
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  validate(listForDateSchema),
  listForDate,
);

router.post(
  "/bulk",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  validate(bulkRecordSchema),
  bulkRecord,
);

export default router;
