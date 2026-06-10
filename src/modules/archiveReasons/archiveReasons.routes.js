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
import { reportSchema } from "./validators/report.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import report from "./handlers/report.handler.js";

const router = Router();

// Sabab select'i uchun (arxivlash modali) - har qanday auth'langan owner o'qiydi
router.get("/", requireAuth, validate(listSchema), list);
router.get(
  "/report",
  requireAuth,
  requireRole(ROLES.OWNER),
  validate(reportSchema),
  report,
);
router.get("/:id", requireAuth, validate(idSchema), getById);

router.post(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.ARCHIVE_REASONS_MANAGE),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.ARCHIVE_REASONS_MANAGE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.ARCHIVE_REASONS_MANAGE),
  validate(idSchema),
  remove,
);

export default router;
