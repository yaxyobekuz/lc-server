import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import {
  idSchema,
  adjustmentIdSchema,
  payoutIdSchema,
} from "./validators/id.validator.js";
import { calculateSchema } from "./validators/calculate.validator.js";
import { addAdjustmentSchema } from "./validators/addAdjustment.validator.js";
import { recordPayoutSchema } from "./validators/recordPayout.validator.js";
import { recordPayoutBatchSchema } from "./validators/recordPayoutBatch.validator.js";
import { cancelSchema } from "./validators/cancel.validator.js";
import {
  dashboardSchema,
  trendSchema,
  myHistorySchema,
} from "./validators/dashboard.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import getPayouts from "./handlers/getPayouts.handler.js";
import calculate from "./handlers/calculate.handler.js";
import recompute from "./handlers/recompute.handler.js";
import approve from "./handlers/approve.handler.js";
import cancel from "./handlers/cancel.handler.js";
import addAdjustment from "./handlers/addAdjustment.handler.js";
import removeAdjustment from "./handlers/removeAdjustment.handler.js";
import recordPayout from "./handlers/recordPayout.handler.js";
import recordPayoutBatch from "./handlers/recordPayoutBatch.handler.js";
import removePayout from "./handlers/removePayout.handler.js";
import dashboard from "./handlers/dashboard.handler.js";
import teacherReport from "./handlers/teacherReport.handler.js";
import trend from "./handlers/trend.handler.js";
import myCurrent from "./handlers/myCurrent.handler.js";
import myHistory from "./handlers/myHistory.handler.js";

const router = Router();

// Aniq pathlar - :id parametrli routelardan oldin
router.get(
  "/dashboard",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_READ),
  validate(dashboardSchema),
  dashboard,
);
router.get(
  "/dashboard/teachers",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_READ),
  validate(dashboardSchema),
  teacherReport,
);
router.get(
  "/trend",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_READ),
  validate(trendSchema),
  trend,
);

// Teacher (own) endpoints
router.get(
  "/teacher/me/current",
  requireAuth,
  requireRole(ROLES.TEACHER),
  myCurrent,
);
router.get(
  "/teacher/me",
  requireAuth,
  requireRole(ROLES.TEACHER),
  validate(myHistorySchema),
  myHistory,
);

// Bulk / single calculate
router.post(
  "/calculate",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_MANAGE),
  validate(calculateSchema),
  calculate,
);

// Ommaviy to'lov - :id parametrli routelardan oldin (aniq path)
router.post(
  "/payouts/batch",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_DISTRIBUTE),
  validate(recordPayoutBatchSchema),
  recordPayoutBatch,
);

// Payouts (delete by payoutId - alohida path)
router.delete(
  "/payouts/:payoutId",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_DISTRIBUTE),
  validate(payoutIdSchema),
  removePayout,
);

// List
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_READ),
  validate(listSchema),
  list,
);

// Resource by ID — owner yoki teacher (handler ichida teacher faqat o'zinikini ko'radi)
router.get(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER, ROLES.TEACHER),
  validate(idSchema),
  getById,
);
router.get(
  "/:id/payouts",
  requireAuth,
  requireRole(ROLES.OWNER, ROLES.TEACHER),
  validate(idSchema),
  getPayouts,
);

router.post(
  "/:id/recompute",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_MANAGE),
  validate(idSchema),
  recompute,
);
router.post(
  "/:id/approve",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_MANAGE),
  validate(idSchema),
  approve,
);
router.post(
  "/:id/cancel",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_MANAGE),
  validate(cancelSchema),
  cancel,
);
router.post(
  "/:id/adjustments",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_MANAGE),
  validate(addAdjustmentSchema),
  addAdjustment,
);
router.delete(
  "/:id/adjustments/:adjId",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_MANAGE),
  validate(adjustmentIdSchema),
  removeAdjustment,
);
router.post(
  "/:id/payouts",
  requireAuth,
  requirePermission(PERMISSIONS.SALARIES_DISTRIBUTE),
  validate(recordPayoutSchema),
  recordPayout,
);

export default router;
