import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema,
  idSchema,
  createSchema,
  updateSchema,
} from "./validators/leadOptions.validators.js";

import list from "./handlers/list.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

router.get("/", requireAuth, validate(listSchema), list);

router.post(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(idSchema),
  remove,
);

export default router;
