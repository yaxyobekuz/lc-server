import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { listSchema } from "./validators/list.validator.js";
import {
  updateSchema,
  idSchema,
  permanentDeleteSchema,
} from "./validators/update.validator.js";
import { setPasswordSchema } from "./validators/password.validator.js";
import { archiveActionSchema } from "./validators/archive.validator.js";
import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import restore from "./handlers/restore.handler.js";
import permanentRemove from "./handlers/permanentRemove.handler.js";
import groupHistory from "./handlers/groupHistory.handler.js";
import getPassword from "./handlers/getPassword.handler.js";
import setPassword from "./handlers/setPassword.handler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  validate(listSchema),
  list,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  validate(idSchema),
  getById,
);
router.get(
  "/:id/group-history",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  validate(idSchema),
  groupHistory,
);
router.get(
  "/:id/password",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(idSchema),
  getPassword,
);
router.patch(
  "/:id/password",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(setPasswordSchema),
  setPassword,
);
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(archiveActionSchema),
  remove,
);
router.post(
  "/:id/restore",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(archiveActionSchema),
  restore,
);
router.delete(
  "/:id/permanent",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(permanentDeleteSchema),
  permanentRemove,
);

export default router;
