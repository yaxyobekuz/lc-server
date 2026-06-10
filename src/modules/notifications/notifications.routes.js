import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { ROLES } from "../../constants/roles.js";

import { listSchema } from "./validators/list.validator.js";
import {
  idSchema,
  recipientListSchema,
  inboxListSchema,
} from "./validators/id.validator.js";
import { sendSchema, previewSchema } from "./validators/send.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import getRecipients from "./handlers/getRecipients.handler.js";
import send from "./handlers/send.handler.js";
import preview from "./handlers/preview.handler.js";
import cancel from "./handlers/cancel.handler.js";
import myInbox from "./handlers/myInbox.handler.js";
import unreadCount from "./handlers/unreadCount.handler.js";
import markRead from "./handlers/markRead.handler.js";
import markAllRead from "./handlers/markAllRead.handler.js";
import stats from "./handlers/stats.handler.js";

const router = Router();

// Inbox endpoints (har authenticated user)
router.get("/inbox/unread-count", requireAuth, unreadCount);
router.get("/inbox", requireAuth, validate(inboxListSchema), myInbox);
router.post("/inbox/read-all", requireAuth, markAllRead);
router.post("/inbox/:id/read", requireAuth, validate(idSchema), markRead);

// Stats (owner)
router.get(
  "/stats",
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  stats,
);

// List (owner uchun barcha, teacher uchun own) - o'quvchilar /inbox dan foydalanadi
router.get(
  "/",
  requireAuth,
  requireRole(ROLES.OWNER, ROLES.TEACHER),
  validate(listSchema),
  list,
);

// Recipient count preview (jonli hisob - xabar yaratmaydi)
router.post(
  "/preview",
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  validate(previewSchema),
  preview,
);

// Send
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  validate(sendSchema),
  send,
);

// Rejalashtirilgan xabarni bekor qilish
router.post(
  "/:id/cancel",
  requireAuth,
  requirePermission(PERMISSIONS.NOTIFICATIONS_SEND),
  validate(idSchema),
  cancel,
);

// Detail va recipients - boshqaruv yuzasi (oluvchilar PII). O'quvchilar bloklanadi
// (handler ichida teacher faqat o'zi yuborganini ko'radi).
router.get(
  "/:id",
  requireAuth,
  requireRole(ROLES.OWNER, ROLES.TEACHER),
  validate(idSchema),
  getById,
);
router.get(
  "/:id/recipients",
  requireAuth,
  requireRole(ROLES.OWNER, ROLES.TEACHER),
  validate(recipientListSchema),
  getRecipients,
);

export default router;
