import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import { listSchema, myListSchema } from "./validators/list.validator.js";
import { idSchema } from "./validators/id.validator.js";
import { submitSchema } from "./validators/submit.validator.js";
import {
  replySchema,
  resolveSchema,
  rejectSchema,
  rangeSchema,
} from "./validators/actions.validator.js";

import list from "./handlers/list.handler.js";
import getById from "./handlers/getById.handler.js";
import submit from "./handlers/submit.handler.js";
import myFeedback from "./handlers/myFeedback.handler.js";
import review from "./handlers/review.handler.js";
import reply from "./handlers/reply.handler.js";
import resolve from "./handlers/resolve.handler.js";
import reject from "./handlers/reject.handler.js";
import stats from "./handlers/stats.handler.js";

const router = Router();

router.get(
  "/stats",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_READ),
  validate(rangeSchema),
  stats,
);

router.get("/me", requireAuth, validate(myListSchema), myFeedback);

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_READ),
  validate(listSchema),
  list,
);

router.post("/", requireAuth, validate(submitSchema), submit);

router.get("/:id", requireAuth, validate(idSchema), getById);

router.post(
  "/:id/review",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_RESPOND),
  validate(idSchema),
  review,
);
router.post(
  "/:id/reply",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_RESPOND),
  validate(replySchema),
  reply,
);
router.post(
  "/:id/resolve",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_RESPOND),
  validate(resolveSchema),
  resolve,
);
router.post(
  "/:id/reject",
  requireAuth,
  requirePermission(PERMISSIONS.FEEDBACK_RESPOND),
  validate(rejectSchema),
  reject,
);

export default router;
