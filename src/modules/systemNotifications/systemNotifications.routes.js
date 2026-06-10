import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireRole from "../../middleware/requireRole.js";
import validate from "../../middleware/validate.js";
import { ROLES } from "../../constants/roles.js";

import { listSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { createSchema } from "./validators/create.validator.js";

import list from "./handlers/list.handler.js";
import unreadCount from "./handlers/unreadCount.handler.js";
import markRead from "./handlers/markRead.handler.js";
import markAllRead from "./handlers/markAllRead.handler.js";
import create from "./handlers/create.handler.js";

const router = Router();

// Tizim bildirishnomalari - faqat owner uchun
router.use(requireAuth, requireRole(ROLES.OWNER));

router.get("/", validate(listSchema), list);
router.get("/unread-count", unreadCount);
router.post("/", validate(createSchema), create);
router.post("/read-all", markAllRead);
router.post("/:id/read", validate(idSchema), markRead);

export default router;
