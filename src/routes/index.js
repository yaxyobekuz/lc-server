import { Router } from "express";
import authRouter from "../modules/auth/auth.routes.js";

const router = Router();

router.get("/health", (_req, res) =>
  res.json({ success: true, message: "Server ishlayapti" }),
);

router.use("/auth", authRouter);

// Mount new modules here:
// router.use("/students", studentsRouter);

export default router;
