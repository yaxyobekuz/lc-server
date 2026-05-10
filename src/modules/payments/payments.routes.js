import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { recordSchema } from "./validators/record.validator.js";
import { refundSchema } from "./validators/refund.validator.js";
import { idSchema } from "./validators/id.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import record from "./handlers/record.handler.js";
import refund from "./handlers/refund.handler.js";
import receipt from "./handlers/receipt.handler.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(listSchema),
  list,
);
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(idSchema),
  getById,
);
router.get(
  "/:id/receipt",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(idSchema),
  receipt,
);
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_CREATE),
  validate(recordSchema),
  record,
);
router.post(
  "/:id/refund",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_REFUND),
  validate(refundSchema),
  refund,
);

export default router;
