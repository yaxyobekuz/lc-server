import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { searchSchema } from "./validators/search.validator.js";
import search from "./handlers/search.handler.js";

const router = Router();

// Global qidiruv - o'quvchi/o'qituvchini ko'rish ruxsati bo'lganlar uchun
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.USERS_READ),
  validate(searchSchema),
  search,
);

export default router;
