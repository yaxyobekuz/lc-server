import User from "../../../models/user.model.js";
import RefreshToken from "../../../models/refreshToken.model.js";
import ApiError from "../../../utils/ApiError.js";
import { signAccess, signRefresh, verifyRefresh } from "../../../utils/jwt.js";
import {
  hashPassword,
  comparePassword,
} from "../../../helpers/password.helper.js";
import { collectPermissions } from "../../../helpers/permission.helper.js";
import { buildUserProfile } from "../../../helpers/userProfile.helper.js";
import { sha256 } from "../../../utils/hashToken.js";
import { normalizePhone, isPhoneLike } from "../../../utils/phone.js";
import { ROLES } from "../../../constants/roles.js";

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const buildRefreshExpiry = () => new Date(Date.now() + REFRESH_TTL_MS);

export const issueTokens = async (user, { userAgent, ip }) => {
  const payload = { sub: String(user._id), role: user.role };
  const accessToken = signAccess(payload);
  const refreshToken = signRefresh(payload);

  await RefreshToken.create({
    user: user._id,
    tokenHash: sha256(refreshToken),
    userAgent,
    ip,
    expiresAt: buildRefreshExpiry(),
  });

  return { accessToken, refreshToken };
};

export const sanitizeUser = (user) => {
  const obj = user.toJSON ? user.toJSON() : user;
  delete obj.passwordHash;
  return obj;
};

export const login = async ({ login, password, userAgent, ip }) => {
  const trimmed = String(login || "").trim();
  if (!trimmed) throw new ApiError(400, "Login kerak");

  const phone = isPhoneLike(trimmed) ? normalizePhone(trimmed) : null;
  const filters = [{ username: trimmed.toLowerCase() }];
  if (phone) filters.push({ phone });

  const user = await User.findOne({ $or: filters }).select("+passwordHash");
  if (!user || !user.isActive || user.isDeleted) {
    throw new ApiError(401, "Login yoki parol noto'g'ri");
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) throw new ApiError(401, "Login yoki parol noto'g'ri");

  const { accessToken, refreshToken } = await issueTokens(user, {
    userAgent,
    ip,
  });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
};

export const rotateRefresh = async ({ rawRefresh, userAgent, ip }) => {
  if (!rawRefresh) throw new ApiError(401, "Sessiya topilmadi");

  let payload;
  try {
    payload = verifyRefresh(rawRefresh);
  } catch {
    throw new ApiError(401, "Sessiya muddati tugagan");
  }

  const tokenHash = sha256(rawRefresh);
  const now = new Date();
  // Race-safe: faqat hali revoke qilinmagan yozuvni atomik tarzda yopamiz
  const revoked = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { new: true },
  );
  if (!revoked) throw new ApiError(401, "Sessiya tugagan");

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive || user.isDeleted) {
    throw new ApiError(401, "Foydalanuvchi topilmadi");
  }

  const { accessToken, refreshToken } = await issueTokens(user, {
    userAgent,
    ip,
  });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
};

export const logout = async ({ rawRefresh }) => {
  if (!rawRefresh) return;
  const tokenHash = sha256(rawRefresh);
  await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
};

export const me = async (user) => {
  const [permissions, profile] = await Promise.all([
    collectPermissions(user.role),
    buildUserProfile(user),
  ]);
  return {
    user: sanitizeUser(user),
    role: user.role,
    permissions,
    profile,
  };
};

export const updateProfile = async (currentUser, body) => {
  const user = await User.findById(currentUser._id);
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");

  if (body.phone !== undefined) {
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");
    if (phone && phone !== user.phone) {
      const taken = await User.findOne({ phone, _id: { $ne: user._id } });
      if (taken) throw new ApiError(409, "Bu telefon raqam band");
    }
    user.phone = phone || undefined;
  }

  if (body.firstName !== undefined) user.firstName = body.firstName.trim();
  if (body.lastName !== undefined) user.lastName = body.lastName.trim();
  if (body.birthDate !== undefined) {
    user.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  }
  if (body.gender !== undefined) user.gender = body.gender || null;

  await user.save();
  return sanitizeUser(user);
};

export const changePassword = async (currentUser, { currentPassword, newPassword }) => {
  const user = await User.findById(currentUser._id).select("+passwordHash");
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");

  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) throw new ApiError(400, "Joriy parol noto'g'ri");

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  // Parol o'zgargach barcha eski sessiyalarni bekor qilamiz
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
};

export const registerUser = async (body) => {
  const phone = body.phone ? normalizePhone(body.phone) : null;
  if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");

  const username = String(body.username).toLowerCase().trim();

  // Telefon takrorlanmasligi kerak: shu raqam allaqachon biror
  // foydalanuvchida bo'lsa (arxivlangan/o'chirilgan bo'lsa ham), rad etamiz.
  if (phone) {
    const phoneTaken = await User.findOne({ phone });
    if (phoneTaken) {
      throw new ApiError(409, "Bu telefon raqam allaqachon ro'yxatdan o'tgan");
    }
  }

  const usernameTaken = await User.findOne({ username });
  if (usernameTaken) {
    throw new ApiError(409, "Bunday login (username) allaqachon mavjud");
  }

  if (![ROLES.TEACHER, ROLES.STUDENT].includes(body.role)) {
    throw new ApiError(400, "Noto'g'ri rol");
  }

  const passwordHash = await hashPassword(body.password);

  const doc = {
    firstName: body.firstName.trim(),
    lastName: body.lastName.trim(),
    username,
    phone: phone || undefined,
    passwordHash,
    role: body.role,
    isActive: true,
    birthDate: body.birthDate ? new Date(body.birthDate) : null,
  };

  if (body.role === ROLES.STUDENT) {
    // Jins faqat o'quvchi uchun saqlanadi (o'qituvchida yo'q).
    doc.gender = body.gender || null;
    doc.enrolledAt = body.enrolledAt ? new Date(body.enrolledAt) : new Date();
  }

  if (body.role === ROLES.TEACHER) {
    doc.hiredAt = body.hiredAt ? new Date(body.hiredAt) : new Date();
  }

  const user = await User.create(doc);
  return sanitizeUser(user);
};
