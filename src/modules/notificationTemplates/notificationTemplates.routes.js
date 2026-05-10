import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

// Read uchun authenticated foydalanuvchi yetarli (teacher ham send modal'da ishlatadi)
router.get("/", requireAuth, validate(listSchema), list);
router.get("/:id", requireAuth, validate(idSchema), getById);

router.post(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE),
  validate(idSchema),
  remove,
);

export default router;
