import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { periodSchema } from "./validators/period.validator.js";
import { monthsBackSchema } from "./validators/monthsBack.validator.js";
import { studentStatsSchema } from "./validators/studentStats.validator.js";
import { retentionSchema } from "./validators/retention.validator.js";

import overview from "./handlers/overview.handler.js";
import studentFlow from "./handlers/studentFlow.handler.js";
import studentStats from "./handlers/studentStats.handler.js";
import retention from "./handlers/retention.handler.js";

const router = Router();

router.get(
  "/overview",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(periodSchema),
  overview,
);
router.get(
  "/student-flow",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(monthsBackSchema),
  studentFlow,
);
router.get(
  "/student-stats",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(studentStatsSchema),
  studentStats,
);
router.get(
  "/retention",
  requireAuth,
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_READ),
  validate(retentionSchema),
  retention,
);

export default router;
