import logger from "../config/logger.js";
import ActivityLog from "../models/activityLog.model.js";
import {
  sanitize,
  extractResource,
  truncateBody,
} from "../helpers/auditLog.helper.js";

const TRACKED_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

const auditLog = (req, res, next) => {
  if (!TRACKED_METHODS.has(req.method)) return next();
  const startedAt = Date.now();

  res.on("finish", () => {
    setImmediate(async () => {
      try {
        const sanitized = sanitize(req.body || {});
        const safeBody = truncateBody(sanitized);
        const resource = extractResource(req.originalUrl || req.path);

        await ActivityLog.create({
          user: req.user?._id || null,
          userRole: req.user?.role || "system",
          method: req.method,
          path: req.originalUrl || req.path,
          status: res.statusCode || 0,
          durationMs: Date.now() - startedAt,
          ip: req.ip || "",
          userAgent: req.get("user-agent") || "",
          body: safeBody,
          resourceType: resource.type,
          resourceId: resource.id,
        });
      } catch (err) {
        logger.warn(
          { err, path: req.originalUrl, method: req.method },
          "AuditLog yozib bo'lmadi",
        );
      }
    });
  });

  next();
};

export default auditLog;
