import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  topupSchema,
  withdrawSchema,
  applySchema,
  studentIdParamSchema,
  idParamSchema,
  listSchema,
  reportSchema,
} from "./validators/deposit.validator.js";

import balance from "./handlers/balance.handler.js";
import history from "./handlers/history.handler.js";
import topup from "./handlers/topup.handler.js";
import withdraw from "./handlers/withdraw.handler.js";
import apply from "./handlers/apply.handler.js";
import list from "./handlers/list.handler.js";
import report from "./handlers/report.handler.js";
import remove from "./handlers/remove.handler.js";

const router = Router();

// ── O'qish ──
router.get(
  "/report",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(reportSchema),
  report,
);
router.get(
  "/transactions",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(listSchema),
  list,
);
router.get(
  "/students/:studentId",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(studentIdParamSchema),
  balance,
);
router.get(
  "/students/:studentId/history",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(studentIdParamSchema),
  history,
);

// ── Pul amallari ──
router.post(
  "/topup",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(topupSchema),
  topup,
);
router.post(
  "/withdraw",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(withdrawSchema),
  withdraw,
);
router.post(
  "/apply",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(applySchema),
  apply,
);
router.delete(
  "/transactions/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(idParamSchema),
  remove,
);

export default router;
