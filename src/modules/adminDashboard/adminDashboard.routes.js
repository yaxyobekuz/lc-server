import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { periodSchema } from "./validators/period.validator.js";
import { monthsBackSchema } from "./validators/monthsBack.validator.js";

import overview from "./handlers/overview.handler.js";
import monthlyFinancials from "./handlers/monthlyFinancials.handler.js";
import incomeByDirection from "./handlers/incomeByDirection.handler.js";
import incomeByTeacher from "./handlers/incomeByTeacher.handler.js";
import studentFlow from "./handlers/studentFlow.handler.js";
import forecast from "./handlers/forecast.handler.js";

const router = Router();

router.get(
  "/overview",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(periodSchema),
  overview,
);
router.get(
  "/monthly-financials",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(monthsBackSchema),
  monthlyFinancials,
);
router.get(
  "/income-by-direction",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(periodSchema),
  incomeByDirection,
);
router.get(
  "/income-by-teacher",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(periodSchema),
  incomeByTeacher,
);
router.get(
  "/student-flow",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(monthsBackSchema),
  studentFlow,
);
router.get(
  "/forecast",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  forecast,
);

export default router;
