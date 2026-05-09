import asyncHandler from "./asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { verifyAccess } from "../utils/jwt.js";
import User from "../models/user.model.js";
import { collectPermissions } from "../helpers/permission.helper.js";

// Verifies access JWT and populates req.user / req.permissions
const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

  let payload;
  try {
    payload = verifyAccess(token);
  } catch {
    throw new ApiError(401, "Token yaroqsiz yoki muddati o'tgan");
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, "Foydalanuvchi topilmadi");

  req.user = user;
  req.permissions = await collectPermissions(user.role);
  next();
});

export default requireAuth;
