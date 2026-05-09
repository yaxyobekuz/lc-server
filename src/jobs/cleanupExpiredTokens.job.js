import RefreshToken from "../models/refreshToken.model.js";
import logger from "../config/logger.js";

export const JOB_NAME = "daily.cleanup-expired-tokens";

export default function defineCleanupExpiredTokens(agenda) {
  agenda.define(JOB_NAME, async () => {
    const r = await RefreshToken.deleteMany({
      $or: [{ expiresAt: { $lt: new Date() } }, { revokedAt: { $exists: true } }],
    });
    logger.info({ deleted: r.deletedCount }, "Eskirgan refresh tokenlar tozalandi");
  });
}
