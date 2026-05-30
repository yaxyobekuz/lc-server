import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";
import { addStudentSchema } from "./validators/addStudent.validator.js";
import { transferSchema } from "./validators/transfer.validator.js";
import { replaceTeacherSchema } from "./validators/replaceTeacher.validator.js";
import {
  idParamSchema,
  studentParamsSchema,
  historyQuerySchema,
} from "./validators/misc.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import addStudent from "./handlers/addStudent.handler.js";
import removeStudent from "./handlers/removeStudent.handler.js";
import transferStudent from "./handlers/transferStudent.handler.js";
import replaceTeacher from "./handlers/replaceTeacher.handler.js";
import history from "./handlers/history.handler.js";
import myActive from "./handlers/myActive.handler.js";
import myTeach from "./handlers/myTeach.handler.js";

const router = Router();

// "Mening" routelar (param routelar oldida bo'lishi shart)
router.get("/me/active", requireAuth, myActive);
router.get("/me/teach", requireAuth, myTeach);

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_READ),
  validate(listSchema),
  list,
);
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_CREATE),
  validate(createSchema),
  create,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_READ),
  validate(idParamSchema),
  getById,
);
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_UPDATE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_DELETE),
  validate(idParamSchema),
  remove,
);

router.post(
  "/:id/students",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_MANAGE_STUDENTS),
  validate(addStudentSchema),
  addStudent,
);
router.delete(
  "/:id/students/:studentId",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_MANAGE_STUDENTS),
  validate(studentParamsSchema),
  removeStudent,
);
router.post(
  "/:id/students/:studentId/transfer",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_MANAGE_STUDENTS),
  validate(transferSchema),
  transferStudent,
);

router.post(
  "/:id/replace-teacher",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_UPDATE),
  validate(replaceTeacherSchema),
  replaceTeacher,
);

router.get(
  "/:id/history",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_READ),
  validate(historyQuerySchema),
  history,
);

export default router;
