import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema as groupFeeListSchema,
  byGroupSchema,
  upsertSchema,
  regenerateSchema,
} from "./validators/groupFee.validator.js";
import {
  listSchema as paymentListSchema,
  idParamSchema as paymentIdSchema,
} from "./validators/studentPayment.validator.js";
import {
  createSchema as transactionCreateSchema,
  idParamSchema as transactionIdSchema,
} from "./validators/transaction.validator.js";
import {
  listSchema as discountListSchema,
  createSchema as discountCreateSchema,
  updateSchema as discountUpdateSchema,
  idParamSchema as discountIdSchema,
} from "./validators/discount.validator.js";
import { monthlySchema } from "./validators/report.validator.js";

import groupFeeList from "./handlers/groupFee.list.handler.js";
import groupFeeByGroup from "./handlers/groupFee.byGroup.handler.js";
import groupFeeUpsert from "./handlers/groupFee.upsert.handler.js";
import regenerate from "./handlers/regenerate.handler.js";
import paymentList from "./handlers/studentPayment.list.handler.js";
import paymentGetById from "./handlers/studentPayment.getById.handler.js";
import transactionCreate from "./handlers/transaction.create.handler.js";
import transactionRemove from "./handlers/transaction.remove.handler.js";
import discountList from "./handlers/discount.list.handler.js";
import discountCreate from "./handlers/discount.create.handler.js";
import discountUpdate from "./handlers/discount.update.handler.js";
import discountRemove from "./handlers/discount.remove.handler.js";
import reportMonthly from "./handlers/report.monthly.handler.js";

const router = Router();

// ── Guruh to'lovlari ──
router.get(
  "/group-fees",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(groupFeeListSchema),
  groupFeeList,
);
router.get(
  "/group-fees/group/:groupId",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(byGroupSchema),
  groupFeeByGroup,
);
router.put(
  "/group-fees",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(upsertSchema),
  groupFeeUpsert,
);
router.post(
  "/regenerate",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(regenerateSchema),
  regenerate,
);

// ── O'quvchi to'lovlari ──
router.get(
  "/student-payments",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(paymentListSchema),
  paymentList,
);
router.get(
  "/student-payments/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(paymentIdSchema),
  paymentGetById,
);

// ── Kirim (tranzaksiyalar) ──
router.post(
  "/transactions",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(transactionCreateSchema),
  transactionCreate,
);
router.delete(
  "/transactions/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_PAY),
  validate(transactionIdSchema),
  transactionRemove,
);

// ── Chegirmalar ──
router.get(
  "/discounts",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(discountListSchema),
  discountList,
);
router.post(
  "/discounts",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(discountCreateSchema),
  discountCreate,
);
router.patch(
  "/discounts/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(discountUpdateSchema),
  discountUpdate,
);
router.delete(
  "/discounts/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(discountIdSchema),
  discountRemove,
);

// ── Hisobotlar ──
router.get(
  "/reports/monthly",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(monthlySchema),
  reportMonthly,
);

export default router;
