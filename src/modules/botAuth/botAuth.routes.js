import { Router } from "express";
import validate from "../../middleware/validate.js";
import { verifySchema } from "./validators/verify.validator.js";
import verify from "./handlers/verify.handler.js";

const router = Router();

// Public - no auth (Telegram initData o'zi authentication)
router.post("/verify", validate(verifySchema), verify);

export default router;
