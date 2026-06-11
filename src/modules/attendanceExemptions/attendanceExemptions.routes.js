import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";
import { idSchema } from "./validators/id.validator.js";

import list from "./handlers/list.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ATTENDANCE_READ),
  validate(listSchema),
  list,
);
// CREATE/PATCH/DELETE: owner - barchasi; teacher - faqat O'Z guruhidagi
// o'quvchi uchun (egalik service qatlamida tekshiriladi). Teacher'da
// ATTENDANCE_MANAGE yo'q, shuning uchun ATTENDANCE_RECORD bilan gate qilamiz
// (teacher davomatni belgilay olgani kabi ozod davrini ham qo'ya oladi).
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER, ROLES.TEACHER),
  requirePermission(PERMISSIONS.ATTENDANCE_RECORD),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER, ROLES.TEACHER),
  requirePermission(PERMISSIONS.ATTENDANCE_RECORD),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER, ROLES.TEACHER),
  requirePermission(PERMISSIONS.ATTENDANCE_RECORD),
  validate(idSchema),
  remove,
);

export default router;
