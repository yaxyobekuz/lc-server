import crypto from "crypto";
import User from "../../../models/user.model.js";
import RefreshToken from "../../../models/refreshToken.model.js";
import ApiError from "../../../utils/ApiError.js";
import { signAccess, signRefresh, verifyRefresh } from "../../../utils/jwt.js";
import { comparePassword } from "../../../helpers/password.helper.js";
import { collectPermissions } from "../../../helpers/permission.helper.js";

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const buildTokens = (user) => {
  const payload = { sub: user._id.toString(), role: user.role };
  return { accessToken: signAccess(payload), refreshToken: signRefresh(payload) };
};

const persistRefresh = async (user, refreshToken, meta) => {
  const decoded = verifyRefresh(refreshToken);
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    userAgent: meta?.userAgent,
    ip: meta?.ip,
    expiresAt: new Date(decoded.exp * 1000),
  });
};

export const login = async ({ login, password }, meta) => {
  // login may be either a username or a phone number
  const user = await User.findOne({
    $or: [{ username: login.toLowerCase() }, { phone: login }],
  }).select("+passwordHash");

  if (!user || !user.isActive) throw new ApiError(401, "Login yoki parol noto'g'ri");

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) throw new ApiError(401, "Login yoki parol noto'g'ri");

  const tokens = buildTokens(user);
  await persistRefresh(user, tokens.refreshToken, meta);

  const permissions = await collectPermissions(user.role);
  return { user, permissions, ...tokens };
};

export const refresh = async (refreshToken, meta) => {
  if (!refreshToken) throw new ApiError(401, "Refresh token topilmadi");

  let payload;
  try {
    payload = verifyRefresh(refreshToken);
  } catch {
    throw new ApiError(401, "Refresh token yaroqsiz");
  }

  const stored = await RefreshToken.findOne({
    tokenHash: hashToken(refreshToken),
    revokedAt: { $exists: false },
  });
  if (!stored) throw new ApiError(401, "Sessiya bekor qilingan");

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, "Foydalanuvchi topilmadi");

  // Rotatsiya: eski refreshni bekor qilamiz, yangisini chiqaramiz
  stored.revokedAt = new Date();
  await stored.save();

  const tokens = buildTokens(user);
  await persistRefresh(user, tokens.refreshToken, meta);
  return { user, ...tokens };
};

export const logout = async (refreshToken) => {
  if (!refreshToken) return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(refreshToken) },
    { $set: { revokedAt: new Date() } },
  );
};

export const me = async (user) => {
  const permissions = await collectPermissions(user.role);
  return { user, role: user.role, permissions };
};
