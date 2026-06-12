import "dotenv/config";

// Required env var; throws on boot if missing
const need = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`ENV o'zgaruvchisi yo'q: ${key}`);
  return v;
};

// Vergul bilan ajratilgan domenlar ro'yxati -> tozalangan massiv
const parseOrigins = (raw) =>
  String(raw || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const clientUrls = parseOrigins(process.env.CLIENT_URL);
const allowAllOrigins = clientUrls.includes("*");
const realUrls = clientUrls.filter((u) => u !== "*");
const primaryUrl = realUrls[0] || "http://localhost:5173";

const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 5000),

  MONGO_URL: need("MONGO_URL"),

  JWT_ACCESS_SECRET: need("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: need("JWT_REFRESH_SECRET"),
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || "15m",
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || "7d",

  COOKIE_SECRET: need("COOKIE_SECRET"),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || "localhost",

  CLIENT_URL: primaryUrl,
  CLIENT_URLS: realUrls,
  ALLOW_ALL_ORIGINS: allowAllOrigins,

  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  TELEGRAM_BOT_TOKEN_2: process.env.TELEGRAM_BOT_TOKEN_2 || "",
  TELEGRAM_BOT_ENABLED:
    String(process.env.TELEGRAM_BOT_ENABLED || "false").toLowerCase() === "true",
  TELEGRAM_BOT_WEBAPP_URL:
    process.env.TELEGRAM_BOT_WEBAPP_URL || `${primaryUrl}/bot-auth`,
});

export const isProd = env.NODE_ENV === "production";

export default env;
