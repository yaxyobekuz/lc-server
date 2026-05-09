import app from "./app.js";
import env from "./config/env.js";
import logger from "./config/logger.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { startJobs, stopJobs } from "./jobs/index.js";
import { startBot, stopBot } from "./bot/index.js";

const start = async () => {
  await connectDB();
  await startJobs();
  await startBot().catch((err) => logger.error({ err }, "Bot ishga tushmadi"));

  const server = app.listen(env.PORT, () => {
    logger.info(`Server ${env.PORT}-portda ishga tushdi`);
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, "Tartibli to'xtatish boshlandi");
    server.close();
    await stopBot().catch(() => null);
    await stopJobs().catch(() => null);
    await disconnectDB().catch(() => null);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

start().catch((err) => {
  logger.error({ err }, "Server ishga tushmadi");
  process.exit(1);
});
