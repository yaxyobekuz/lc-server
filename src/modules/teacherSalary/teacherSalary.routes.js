import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema as salaryListSchema,
  idParamSchema as salaryIdSchema,
  obligationsSchema,
  teacherIdParamSchema as salaryTeacherIdSchema,
} from "./validators/teacherSalary.validator.js";
import {
  createSchema as transactionCreateSchema,
  idParamSchema as transactionIdSchema,
} from "./validators/salaryTransaction.validator.js";
import {
  listSchema as adjustmentListSchema,
  createSchema as adjustmentCreateSchema,
  updateSchema as adjustmentUpdateSchema,
  idParamSchema as adjustmentIdSchema,
} from "./validators/salaryAdjustment.validator.js";

import salaryList from "./handlers/salary.list.handler.js";
import salaryGetById from "./handlers/salary.getById.handler.js";
import salaryHistoryByTeacher from "./handlers/salary.historyByTeacher.handler.js";
import salaryMyFinance from "./handlers/salary.myFinance.handler.js";
import obligations from "./handlers/obligations.handler.js";
import transactionCreate from "./handlers/transaction.create.handler.js";
import transactionRemove from "./handlers/transaction.remove.handler.js";
import adjustmentList from "./handlers/adjustment.list.handler.js";
import adjustmentCreate from "./handlers/adjustment.create.handler.js";
import adjustmentUpdate from "./handlers/adjustment.update.handler.js";
import adjustmentRemove from "./handlers/adjustment.remove.handler.js";

const router = Router();

// ── O'qituvchining o'z moliyasi (teacher panel) ──
// Faqat requireAuth: o'qituvchi faqat O'Z ma'lumotini ko'radi (handler ichida
// teacher rolligi tekshiriladi, ID doimo req.user._id). "/salaries/:id" dan
// OLDIN turishi shart - aks holda "me" param sifatida ushlanib qolardi.
router.get("/me/finance", requireAuth, salaryMyFinance);

// ── O'qituvchi maoshlari (stavka/ish-oynasi davrlardan derived - read-only) ──
router.get(
  "/salaries",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(salaryListSchema),
  salaryList,
);
router.get(
  "/salaries/by-teacher/:teacherId",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(salaryTeacherIdSchema),
  salaryHistoryByTeacher,
);
router.get(
  "/salaries/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(salaryIdSchema),
  salaryGetById,
);
router.get(
  "/obligations",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(obligationsSchema),
  obligations,
);

// ── Maosh to'lovlari (chiqim) ──
router.post(
  "/transactions",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_PAY),
  validate(transactionCreateSchema),
  transactionCreate,
);
router.delete(
  "/transactions/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_PAY),
  validate(transactionIdSchema),
  transactionRemove,
);

// ── Bonus / Jarima ──
router.get(
  "/adjustments",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(adjustmentListSchema),
  adjustmentList,
);
router.post(
  "/adjustments",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(adjustmentCreateSchema),
  adjustmentCreate,
);
router.patch(
  "/adjustments/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(adjustmentUpdateSchema),
  adjustmentUpdate,
);
router.delete(
  "/adjustments/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(adjustmentIdSchema),
  adjustmentRemove,
);

export default router;
