import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { periodSchema } from "./validators/period.validator.js";
import { trendSchema } from "./validators/trend.validator.js";
import { breakdownSchema } from "./validators/breakdown.validator.js";

import summary from "./handlers/summary.handler.js";
import trend from "./handlers/trend.handler.js";
import groupBreakdown from "./handlers/groupBreakdown.handler.js";
import ledger from "./handlers/ledger.handler.js";

const router = Router();

router.get(
  "/summary",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(periodSchema),
  summary,
);
router.get(
  "/trend",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(trendSchema),
  trend,
);
router.get(
  "/group-breakdown",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(breakdownSchema),
  groupBreakdown,
);
router.get(
  "/ledger",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(breakdownSchema),
  ledger,
);

export default router;
