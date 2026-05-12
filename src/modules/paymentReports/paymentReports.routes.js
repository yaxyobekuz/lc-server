import { Router } from "express";
import { z } from "zod";
import asyncHandler from "../../middleware/asyncHandler.js";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import * as service from "./services/paymentReports.service.js";

const periodSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  }),
});

const limitSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

const monthlyTrendSchema = z.object({
  query: z.object({
    months: z.coerce.number().int().min(1).max(36).optional(),
  }),
});

const dailySchema = z.object({
  query: z.object({
    date: z.coerce.date(),
  }),
});

const router = Router();

router.get(
  "/summary",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(periodSchema),
  asyncHandler(async (req, res) => {
    const data = await service.summary({
      year: req.query.year,
      month: req.query.month,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  "/group-stats",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(periodSchema),
  asyncHandler(async (req, res) => {
    const data = await service.groupStats({
      year: req.query.year,
      month: req.query.month,
    });
    res.json({ success: true, data });
  }),
);

router.get(
  "/top-debtors",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(limitSchema),
  asyncHandler(async (req, res) => {
    const data = await service.topDebtors({ limit: req.query.limit });
    res.json({ success: true, data });
  }),
);

router.get(
  "/top-payers",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(limitSchema),
  asyncHandler(async (req, res) => {
    const data = await service.topPayers({ limit: req.query.limit });
    res.json({ success: true, data });
  }),
);

router.get(
  "/monthly-trend",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(monthlyTrendSchema),
  asyncHandler(async (req, res) => {
    const data = await service.monthlyTrend({ months: req.query.months });
    res.json({ success: true, data });
  }),
);

router.get(
  "/daily",
  requireAuth,
  requirePermission(PERMISSIONS.PAYMENTS_READ),
  validate(dailySchema),
  asyncHandler(async (req, res) => {
    const data = await service.daily({ date: req.query.date });
    res.json({ success: true, data });
  }),
);

export default router;
