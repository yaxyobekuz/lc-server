import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import requirePermissionOrSelf from "../../middleware/requirePermissionOrSelf.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";
import { cancelSchema } from "./validators/cancel.validator.js";
import { generateSchema } from "./validators/generate.validator.js";
import { idSchema } from "./validators/id.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import cancel from "./handlers/cancel.handler.js";
import generateMonth from "./handlers/generateMonth.handler.js";

const router = Router();

router.post(
  "/generate-month",
  requireAuth,
  requirePermission(PERMISSIONS.INVOICES_CREATE),
  validate(generateSchema),
  generateMonth,
);

router.get(
  "/",
  requireAuth,
  requirePermissionOrSelf(PERMISSIONS.INVOICES_READ, (req) => req.query.studentId),
  validate(listSchema),
  list,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.INVOICES_READ),
  validate(idSchema),
  getById,
);
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.INVOICES_CREATE),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.INVOICES_UPDATE),
  validate(updateSchema),
  update,
);
router.post(
  "/:id/cancel",
  requireAuth,
  requirePermission(PERMISSIONS.INVOICES_CANCEL),
  validate(cancelSchema),
  cancel,
);

export default router;
