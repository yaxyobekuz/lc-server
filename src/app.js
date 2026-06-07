import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import cookieParser from "cookie-parser";

import env, { isProd } from "./config/env.js";
import apiRouter from "./routes/index.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import auditLog from "./middleware/auditLog.middleware.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    // Origin yo'q so'rovlar (Postman, server-server) ham, ruxsat etilgan domenlar ham o'tadi.
    // CLIENT_URL="*" bo'lsa barcha domenga ruxsat (origin reflect qilinadi).
    origin: (origin, cb) => {
      // Dev rejimida har qanday localhost/127.0.0.1 porti (Vite 5173/5174/...) o'tadi.
      const isLocalhost =
        !isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || "");
      if (
        !origin ||
        env.ALLOW_ALL_ORIGINS ||
        env.CLIENT_URLS.includes(origin) ||
        isLocalhost
      ) {
        return cb(null, true);
      }
      // Xato tashlash o'rniga origin'ni rad etamiz (preflight 500 emas, toza javob).
      cb(null, false);
    },
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(env.COOKIE_SECRET));

if (!isProd) app.use(morgan("dev"));

app.use(generalLimiter);
app.use("/api", auditLog, apiRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
