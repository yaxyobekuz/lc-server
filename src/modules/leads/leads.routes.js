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
  statsSchema,
  createSchema,
  updateSchema,
  convertSchema,
  reminderSchema,
} from "./validators/leads.validators.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import convert from "./handlers/convert.handler.js";
import reminder from "./handlers/reminder.handler.js";
import stats from "./handlers/stats.handler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(listSchema),
  list,
);
router.get(
  "/stats",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(statsSchema),
  stats,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(idSchema),
  getById,
);

router.post(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(createSchema),
  create,
);
router.post(
  "/:id/convert",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(convertSchema),
  convert,
);
router.post(
  "/:id/reminder",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.LEADS_MANAGE),
  validate(reminderSchema),
  reminder,
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
