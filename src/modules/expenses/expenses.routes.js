import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";
import { rangeSchema } from "./validators/range.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import stats from "./handlers/stats.handler.js";

const router = Router();

router.get(
  "/stats",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_READ),
  validate(rangeSchema),
  stats,
);
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_READ),
  validate(listSchema),
  list,
);
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  validate(createSchema),
  create,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_READ),
  validate(idSchema),
  getById,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  validate(idSchema),
  remove,
);

export default router;
