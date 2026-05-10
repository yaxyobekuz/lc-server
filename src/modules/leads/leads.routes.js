import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";
import {
  changeStatusSchema,
  addNoteSchema,
  recordContactSchema,
  setFollowUpSchema,
  setTrialSchema,
  convertSchema,
  rangeSchema,
} from "./validators/actions.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import changeStatus from "./handlers/changeStatus.handler.js";
import addNote from "./handlers/addNote.handler.js";
import recordContact from "./handlers/recordContact.handler.js";
import setFollowUp from "./handlers/setFollowUp.handler.js";
import setTrial from "./handlers/setTrial.handler.js";
import convert from "./handlers/convert.handler.js";
import dashboard from "./handlers/dashboard.handler.js";
import sourcePerformance from "./handlers/sourcePerformance.handler.js";
import todayReminders from "./handlers/todayReminders.handler.js";
import overdueReminders from "./handlers/overdueReminders.handler.js";

const router = Router();

// Aniq pathlar — :id parametrli routelardan oldin
router.get(
  "/dashboard",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(rangeSchema),
  dashboard,
);
router.get(
  "/source-performance",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(rangeSchema),
  sourcePerformance,
);
router.get(
  "/reminders/today",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  todayReminders,
);
router.get(
  "/reminders/overdue",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  overdueReminders,
);

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(listSchema),
  list,
);
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_CREATE),
  validate(createSchema),
  create,
);

router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_READ),
  validate(idSchema),
  getById,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_UPDATE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_DELETE),
  validate(idSchema),
  remove,
);

router.post(
  "/:id/status",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_UPDATE),
  validate(changeStatusSchema),
  changeStatus,
);
router.post(
  "/:id/notes",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_UPDATE),
  validate(addNoteSchema),
  addNote,
);
router.post(
  "/:id/contacts",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_UPDATE),
  validate(recordContactSchema),
  recordContact,
);
router.post(
  "/:id/follow-up",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_UPDATE),
  validate(setFollowUpSchema),
  setFollowUp,
);
router.post(
  "/:id/trial",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_UPDATE),
  validate(setTrialSchema),
  setTrial,
);
router.post(
  "/:id/convert",
  requireAuth,
  requirePermission(PERMISSIONS.LEADS_CONVERT),
  validate(convertSchema),
  convert,
);

export default router;
