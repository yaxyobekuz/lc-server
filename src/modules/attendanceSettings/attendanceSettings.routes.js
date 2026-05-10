import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { updateSchema } from "./validators/update.validator.js";
import get from "./handlers/get.handler.js";
import update from "./handlers/update.handler.js";

const router = Router();

router.get("/", requireAuth, requirePermission(PERMISSIONS.ATTENDANCE_READ), get);
router.patch(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.ATTENDANCE_MANAGE),
  validate(updateSchema),
  update,
);

export default router;
