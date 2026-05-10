import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema,
  idSchema,
  rangeSchema,
} from "./validators/list.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import stats from "./handlers/stats.handler.js";

const router = Router();

router.get(
  "/stats",
  requireAuth,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_READ),
  validate(rangeSchema),
  stats,
);
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_READ),
  validate(listSchema),
  list,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.ACTIVITY_LOGS_READ),
  validate(idSchema),
  getById,
);

export default router;
