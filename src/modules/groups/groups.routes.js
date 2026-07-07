import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";
import { addStudentSchema } from "./validators/addStudent.validator.js";
import { updateMembershipSchema } from "./validators/updateMembership.validator.js";
import {
  idParamSchema,
  permanentDeleteSchema,
  studentParamsSchema,
  historyQuerySchema,
  membershipListSchema,
  membershipByIdSchema,
  membershipUpdateSchema,
} from "./validators/misc.validator.js";
import {
  listSchema as teacherPeriodListSchema,
  createSchema as teacherPeriodCreateSchema,
  updateSchema as teacherPeriodUpdateSchema,
  removeSchema as teacherPeriodRemoveSchema,
} from "./validators/teacherPeriod.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import permanentRemove from "./handlers/permanentRemove.handler.js";
import undelete from "./handlers/undelete.handler.js";
import addStudent from "./handlers/addStudent.handler.js";
import updateMembership from "./handlers/updateMembership.handler.js";
import removeStudent from "./handlers/removeStudent.handler.js";
import membershipList from "./handlers/membership.list.handler.js";
import membershipUpdate from "./handlers/membership.update.handler.js";
import membershipRemove from "./handlers/membership.remove.handler.js";
import history from "./handlers/history.handler.js";
import myActive from "./handlers/myActive.handler.js";
import myTeach from "./handlers/myTeach.handler.js";
import markRemovalNoticeSeen from "./handlers/markRemovalNoticeSeen.handler.js";
import teacherPeriodList from "./handlers/teacherPeriod.list.handler.js";
import teacherPeriodCreate from "./handlers/teacherPeriod.create.handler.js";
import teacherPeriodUpdate from "./handlers/teacherPeriod.update.handler.js";
import teacherPeriodRemove from "./handlers/teacherPeriod.remove.handler.js";

const router = Router();

// "Mening" routelar (param routelar oldida bo'lishi shart)
router.get("/me/active", requireAuth, myActive);
router.get("/me/teach", requireAuth, myTeach);
router.post("/me/removal-notice/seen", requireAuth, markRemovalNoticeSeen);

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
  "/:id/permanent",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_DELETE),
  validate(permanentDeleteSchema),
  permanentRemove,
);
router.post(
  "/:id/undelete",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_DELETE),
  validate(idParamSchema),
  undelete,
);

router.post(
  "/:id/students",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_MANAGE_STUDENTS),
  validate(addStudentSchema),
  addStudent,
);
router.patch(
  "/:id/students/:studentId",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_MANAGE_STUDENTS),
  validate(updateMembershipSchema),
  updateMembership,
);
router.delete(
  "/:id/students/:studentId",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_MANAGE_STUDENTS),
  validate(studentParamsSchema),
  removeStudent,
);

// O'quvchining o'qish davrlari (membership) - ro'yxat + id bo'yicha tahrir/o'chir.
router.get(
  "/:id/students/:studentId/memberships",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_READ),
  validate(membershipListSchema),
  membershipList,
);
router.patch(
  "/:id/memberships/:membershipId",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_MANAGE_STUDENTS),
  validate(membershipUpdateSchema),
  membershipUpdate,
);
router.delete(
  "/:id/memberships/:membershipId",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_MANAGE_STUDENTS),
  validate(membershipByIdSchema),
  membershipRemove,
);

router.get(
  "/:id/history",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_READ),
  validate(historyQuerySchema),
  history,
);

// ── O'qituvchi dars berish DAVRLARI (manba haqiqati - timeline) ──
router.get(
  "/:id/teacher-periods",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_READ),
  validate(teacherPeriodListSchema),
  teacherPeriodList,
);
router.post(
  "/:id/teacher-periods",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_UPDATE),
  validate(teacherPeriodCreateSchema),
  teacherPeriodCreate,
);
router.patch(
  "/:id/teacher-periods/:periodId",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_UPDATE),
  validate(teacherPeriodUpdateSchema),
  teacherPeriodUpdate,
);
router.delete(
  "/:id/teacher-periods/:periodId",
  requireAuth,
  requirePermission(PERMISSIONS.GROUPS_UPDATE),
  validate(teacherPeriodRemoveSchema),
  teacherPeriodRemove,
);

export default router;
