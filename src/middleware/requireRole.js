import ApiError from "../utils/ApiError.js";

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
  if (!roles.includes(req.user.role)) return next(new ApiError(403, "Ruxsat etilmagan"));
  next();
};

export default requireRole;
