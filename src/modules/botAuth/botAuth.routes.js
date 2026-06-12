import { Router } from "express";
import validate from "../../middleware/validate.js";
import { authLimiter, botVerifyLimiter } from "../../middleware/rateLimiter.js";
import { verifySchema } from "./validators/verify.validator.js";
import { loginSchema } from "./validators/login.validator.js";
import verify from "./handlers/verify.handler.js";
import login from "./handlers/login.handler.js";

const router = Router();

// Public - no auth (Telegram initData o'zi authentication)
router.post("/verify", botVerifyLimiter, validate(verifySchema), verify);
// Bog'lanmagan hisob uchun: login+parol bilan kirish va TG ID ni bog'lash
router.post("/login", authLimiter, validate(loginSchema), login);

export default router;
