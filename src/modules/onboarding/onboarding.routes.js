import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { importSchema } from "./validators/import.validator.js";
import importExisting from "./handlers/import.handler.js";

const router = Router();

// Mavjud tarixiy ma'lumotni bitta atomik (all-or-nothing) so'rovda import qilish.
// Guruh + o'quvchilar + a'zoliklar + tarixiy to'lovlar birga yaratiladi.
router.post(
  "/import",
  requireAuth,
  requirePermission(PERMISSIONS.ONBOARDING_IMPORT),
  validate(importSchema),
  importExisting,
);

export default router;
