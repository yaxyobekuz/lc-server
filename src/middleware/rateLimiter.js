import rateLimit from "express-rate-limit";

// Soft global limit
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "So'rovlar soni juda ko'p" },
});

// Stricter limit for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p urinish, biroz kuting" },
});
