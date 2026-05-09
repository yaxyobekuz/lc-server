import ApiError from "../utils/ApiError.js";
import { hasPermission } from "../helpers/permission.helper.js";

const requirePermission = (key) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
  if (!hasPermission(req.permissions, key)) {
    return next(new ApiError(403, "Ruxsat etilmagan"));
  }
  next();
};

export default requirePermission;
