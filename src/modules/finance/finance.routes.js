import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import requireRole from "../../middleware/requireRole.js";
import { ROLES } from "../../constants/roles.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema as groupFeeListSchema,
  byGroupSchema,
  upsertSchema,
} from "./validators/groupFee.validator.js";
import {
  listSchema as paymentListSchema,
  obligationsSchema as paymentObligationsSchema,
  idParamSchema as paymentIdSchema,
  studentIdParamSchema as paymentStudentIdSchema,
} from "./validators/studentPayment.validator.js";
import {
  createSchema as transactionCreateSchema,
  idParamSchema as transactionIdSchema,
} from "./validators/transaction.validator.js";
import {
  debtorsListSchema,
  studentIdParamSchema as debtStudentIdSchema,
  writeOffSchema,
  settingsUpdateSchema as debtSettingsUpdateSchema,
} from "./validators/debt.validator.js";
import {
  listSchema as discountListSchema,
  createSchema as discountCreateSchema,
  updateSchema as discountUpdateSchema,
  idParamSchema as discountIdSchema,
} from "./validators/discount.validator.js";
import groupFeeList from "./handlers/groupFee.list.handler.js";
import groupFeeByGroup from "./handlers/groupFee.byGroup.handler.js";
import groupFeeUpsert from "./handlers/groupFee.upsert.handler.js";
import paymentList from "./handlers/studentPayment.list.handler.js";
import paymentObligations from "./handlers/studentPayment.obligations.handler.js";
import paymentGetById from "./handlers/studentPayment.getById.handler.js";
import paymentHistoryByStudent from "./handlers/studentPayment.historyByStudent.handler.js";
import transactionCreate from "./handlers/transaction.create.handler.js";
import transactionRemove from "./handlers/transaction.remove.handler.js";
import discountList from "./handlers/discount.list.handler.js";
import discountCreate from "./handlers/discount.create.handler.js";
import discountUpdate from "./handlers/discount.update.handler.js";
import discountRemove from "./handlers/discount.remove.handler.js";
import debtorsList from "./handlers/debtors.list.handler.js";
import debtorsWriteOff from "./handlers/debtors.writeOff.handler.js";
import debtorsWriteOffCancel from "./handlers/debtors.writeOffCancel.handler.js";
import debtSettingsGet from "./handlers/debt.settings.get.handler.js";
import debtSettingsUpdate from "./handlers/debt.settings.update.handler.js";

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

// ── O'quvchi to'lovlari ──
router.get(
  "/student-payments",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(paymentListSchema),
  paymentList,
);
// Qarzdorlar (oylik plan qoldig'i > 0) - ":id" dan OLDIN (aks holda "obligations" id deb qabul qilinardi).
router.get(
  "/student-payments/obligations",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(paymentObligationsSchema),
  paymentObligations,
);
router.get(
  "/student-payments/by-student/:studentId",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(paymentStudentIdSchema),
  paymentHistoryByStudent,
);
router.get(
  "/student-payments/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(paymentIdSchema),
  paymentGetById,
);

// ── Qarz nazorati (qarzdorlar + sozlamalar) ──
// "/debt/settings" "/debtors" dan alohida prefiksda - yo'l to'qnashuvi yo'q.
router.get(
  "/debt/settings",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  debtSettingsGet,
);
router.patch(
  "/debt/settings",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(debtSettingsUpdateSchema),
  debtSettingsUpdate,
);
router.get(
  "/debtors",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(debtorsListSchema),
  debtorsList,
);
// Qarzni hisobdan chiqarish (umidsiz qarz) - pulga teng qaror, faqat owner.
router.post(
  "/debtors/:studentId/write-off",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(writeOffSchema),
  debtorsWriteOff,
);
router.delete(
  "/debtors/:studentId/write-off",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(debtStudentIdSchema),
  debtorsWriteOffCancel,
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

export default router;
