import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema as salaryListSchema,
  idParamSchema as salaryIdSchema,
  upsertSchema,
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
import {
  listSchema as configListSchema,
  upsertSchema as configUpsertSchema,
  pairParamSchema as configPairSchema,
} from "./validators/salaryConfig.validator.js";
import {
  listSchema as ratePeriodListSchema,
  idParamSchema as ratePeriodIdSchema,
  createSchema as ratePeriodCreateSchema,
  updateSchema as ratePeriodUpdateSchema,
} from "./validators/ratePeriod.validator.js";

import salaryList from "./handlers/salary.list.handler.js";
import salaryGetById from "./handlers/salary.getById.handler.js";
import salaryHistoryByTeacher from "./handlers/salary.historyByTeacher.handler.js";
import salaryMyFinance from "./handlers/salary.myFinance.handler.js";
import salaryUpsert from "./handlers/salary.upsert.handler.js";
import obligations from "./handlers/obligations.handler.js";
import transactionCreate from "./handlers/transaction.create.handler.js";
import transactionRemove from "./handlers/transaction.remove.handler.js";
import adjustmentList from "./handlers/adjustment.list.handler.js";
import adjustmentCreate from "./handlers/adjustment.create.handler.js";
import adjustmentUpdate from "./handlers/adjustment.update.handler.js";
import adjustmentRemove from "./handlers/adjustment.remove.handler.js";
import configList from "./handlers/config.list.handler.js";
import configUpsert from "./handlers/config.upsert.handler.js";
import configRemove from "./handlers/config.remove.handler.js";
import ratePeriodList from "./handlers/ratePeriod.list.handler.js";
import ratePeriodCreate from "./handlers/ratePeriod.create.handler.js";
import ratePeriodUpdate from "./handlers/ratePeriod.update.handler.js";
import ratePeriodRemove from "./handlers/ratePeriod.remove.handler.js";

const router = Router();

// ── O'qituvchining o'z moliyasi (teacher panel) ──
// Faqat requireAuth: o'qituvchi faqat O'Z ma'lumotini ko'radi (handler ichida
// teacher rolligi tekshiriladi, ID doimo req.user._id). "/salaries/:id" dan
// OLDIN turishi shart - aks holda "me" param sifatida ushlanib qolardi.
router.get("/me/finance", requireAuth, salaryMyFinance);

// ── O'qituvchi maoshlari ──
router.get(
  "/salaries",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(salaryListSchema),
  salaryList,
);
router.put(
  "/salaries",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(upsertSchema),
  salaryUpsert,
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

// ── Stabil maosh sozlamalari (per o'qituvchi + guruh foiz/fiksa) ──
router.get(
  "/configs",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(configListSchema),
  configList,
);
router.put(
  "/configs",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(configUpsertSchema),
  configUpsert,
);
router.delete(
  "/configs/:teacher/:group",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(configPairSchema),
  configRemove,
);

// ── Maosh stavkasi DAVRLARI (manba haqiqati - timeline) ──
router.get(
  "/rate-periods",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(ratePeriodListSchema),
  ratePeriodList,
);
router.post(
  "/rate-periods",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(ratePeriodCreateSchema),
  ratePeriodCreate,
);
router.patch(
  "/rate-periods/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(ratePeriodUpdateSchema),
  ratePeriodUpdate,
);
router.delete(
  "/rate-periods/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_MANAGE),
  validate(ratePeriodIdSchema),
  ratePeriodRemove,
);

export default router;
