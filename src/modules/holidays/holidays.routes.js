import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema } from "./validators/create.validator.js";
import { updateSchema } from "./validators/update.validator.js";
import { congratulateSchema } from "./validators/congratulate.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import create from "./handlers/create.handler.js";
import update from "./handlers/update.handler.js";
import remove from "./handlers/remove.handler.js";
import teacherBirthdays from "./handlers/teacherBirthdays.handler.js";
import congratulate from "./handlers/congratulate.handler.js";

const router = Router();

// O'qituvchilar tug'ilgan kunlari - "/:id" dan OLDIN turishi shart (aks holda
// "teacher-birthdays" id sifatida ushlanib qoladi).
router.get(
  "/teacher-birthdays",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  teacherBirthdays,
);
router.post(
  "/teacher-birthdays/:id/congratulate",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  validate(congratulateSchema),
  congratulate,
);

router.get("/", requireAuth, validate(listSchema), list);
router.get("/:id", requireAuth, validate(idSchema), getById);

router.post(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.HOLIDAYS_MANAGE),
  validate(createSchema),
  create,
);
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.HOLIDAYS_MANAGE),
  validate(updateSchema),
  update,
);
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER),
  requirePermission(PERMISSIONS.HOLIDAYS_MANAGE),
  validate(idSchema),
  remove,
);

export default router;
