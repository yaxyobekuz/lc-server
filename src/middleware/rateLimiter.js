import rateLimit from "express-rate-limit";

// Umumiy yumshoq cheklov
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "So'rovlar soni juda ko'p" },
});

// Auth uchun qattiqroq cheklov
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p urinish, biroz kuting" },
});
