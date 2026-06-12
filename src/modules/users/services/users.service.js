import User from "../../../models/user.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import ArchiveReason from "../../../models/archiveReason.model.js";
import RefreshToken from "../../../models/refreshToken.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { normalizePhone } from "../../../utils/phone.js";
import { hashPassword } from "../../../helpers/password.helper.js";
import { buildUserProfile } from "../../../helpers/userProfile.helper.js";
import { toUtcMidnight } from "../../../helpers/attendance.helper.js";
import { deleteUser, restoreUser } from "../../../helpers/cascadeDelete.helper.js";
import { logAction as logArchiveAction } from "../../archiveReasons/services/archiveReasons.service.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import logger from "../../../config/logger.js";

const STUDENT_ONLY_FIELDS = ["enrolledAt"];
const TEACHER_ONLY_FIELDS = ["hiredAt"];

// Ro'yxatda saralash mumkin bo'lgan maydonlar (xavfsiz oq ro'yxat).
const USER_SORT_FIELDS = {
  createdAt: "createdAt",
  firstName: "firstName",
  lastName: "lastName",
};

// O'quvchilar ro'yxatiga faol guruhlarni qo'shadi -
// ro'yxatdan profil ochmasdan ko'rinishi uchun (at-a-glance).
const enrichStudents = async (items) => {
  const studentIds = items
    .filter((u) => u.role === ROLES.STUDENT)
    .map((u) => u._id);
  if (studentIds.length === 0) return items.map((u) => u.toObject());

  const membershipRows = await GroupMembership.find({
    student: { $in: studentIds },
    leftAt: null,
  })
    .populate("group", { name: 1 })
    .lean();

  const groupsMap = new Map();
  for (const m of membershipRows) {
    if (!m.group) continue;
    const key = String(m.student);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push({ _id: m.group._id, name: m.group.name });
  }

  return items.map((u) => {
    const obj = u.toObject();
    if (u.role === ROLES.STUDENT) {
      obj.activeGroups = groupsMap.get(String(u._id)) || [];
    }
    return obj;
  });
};

export const list = async ({
  role,
  search,
  archived = false,
  page = 1,
  limit = 20,
  sort = "createdAt",
  order = "desc",
}) => {
  const filter = { isActive: archived ? false : true, isDeleted: { $ne: true } };
  if (role) filter.role = role;

  if (search && search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [
      { firstName: rx },
      { lastName: rx },
      { username: rx },
      { phone: rx },
    ];
  }

  const dir = order === "asc" ? 1 : -1;
  const skip = (page - 1) * limit;

  const sortField = USER_SORT_FIELDS[sort] || "createdAt";
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ [sortField]: dir })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  const enriched = await enrichStudents(items);
  return { items: enriched, total, page, limit };
};

export const getById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  return user;
};

export const getProfile = async (id) => {
  const user = await getById(id);
  return buildUserProfile(user);
};

export const update = async (id, body) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini tahrirlab bo'lmaydi");
  }

  // Role-conditional maydonlar
  if (user.role !== ROLES.STUDENT) {
    for (const f of STUDENT_ONLY_FIELDS) {
      if (body[f] !== undefined) {
        throw new ApiError(400, `Bu maydon (${f}) faqat o'quvchi uchun`);
      }
    }
  }
  if (user.role !== ROLES.TEACHER) {
    for (const f of TEACHER_ONLY_FIELDS) {
      if (body[f] !== undefined) {
        throw new ApiError(400, `Bu maydon (${f}) faqat o'qituvchi uchun`);
      }
    }
  }

  // Asosiy maydonlar
  if (body.firstName !== undefined) user.firstName = body.firstName.trim();
  if (body.lastName !== undefined) user.lastName = body.lastName.trim();
  if (body.isActive !== undefined) user.isActive = !!body.isActive;

  if (body.phone !== undefined) {
    const phone = body.phone ? normalizePhone(body.phone) : null;
    if (body.phone && !phone) throw new ApiError(400, "Telefon raqam noto'g'ri");
    user.phone = phone || undefined;
  }

  // Profil maydonlari (har qanday rol uchun)
  if (body.birthDate !== undefined) {
    user.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  }
  if (body.gender !== undefined) {
    user.gender = body.gender || null;
  }

  // Student-specific
  if (user.role === ROLES.STUDENT) {
    if (body.enrolledAt !== undefined) {
      const d = body.enrolledAt ? new Date(body.enrolledAt) : null;
      if (d && d.getTime() > Date.now()) {
        throw new ApiError(400, "Ro'yxatga olingan sana kelajakda bo'lmasin");
      }
      user.enrolledAt = d;
    }
  }

  // Teacher-specific
  if (user.role === ROLES.TEACHER) {
    if (body.hiredAt !== undefined) {
      const d = body.hiredAt ? new Date(body.hiredAt) : null;
      if (d && d.getTime() > Date.now()) {
        throw new ApiError(400, "Ishga olingan sana kelajakda bo'lmasin");
      }
      user.hiredAt = d;
    }
  }

  await user.save();
  return user;
};

// Owner uchun: login va parolni qaytaradi. Parol OCHIQ MATNDA saqlanadi,
// shu sababli to'g'ridan-to'g'ri o'qib ko'rsatiladi.
export const getPassword = async (id) => {
  const user = await User.findById(id).select("username role +passwordHash");
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini ko'rib bo'lmaydi");
  }
  return { username: user.username, password: user.passwordHash || "" };
};

// Owner uchun: foydalanuvchiga yangi parol o'rnatish (javobda bir martalik qaytadi)
export const setPassword = async (id, newPassword) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini o'zgartirib bo'lmaydi");
  }
  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  // Parol o'zgargach barcha eski sessiyalarni bekor qilamiz
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return { username: user.username, password: newPassword };
};

export const softRemove = async (id, { reasonId, by } = {}) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }
  user.isActive = false;
  user.archivedAt = new Date();
  await user.save();

  // O'quvchi arxivlansa - faol a'zoliklarni yopamiz va sababni logga yozamiz.
  if (user.role === ROLES.STUDENT) {
    const today = toUtcMidnight(new Date());

    // Chiqish sababini a'zolikka ham snapshot bilan yozamiz, shunda retention
    // ("Chiqib ketish tahlili") hisoboti shu o'quvchini to'g'ri sabab bo'yicha
    // sanaydi - aks holda u "Sababsiz" guruhiga tushib qoladi.
    let leftReasonDetail = null;
    let leftReasonTitle = "";
    if (reasonId) {
      const reason = await ArchiveReason.findById(reasonId, { title: 1 }).lean();
      if (reason) {
        leftReasonDetail = reason._id;
        leftReasonTitle = reason.title;
      }
    }

    const memberships = await GroupMembership.find({
      student: user._id,
      leftAt: null,
    });
    for (const m of memberships) {
      m.leftAt = today;
      m.leftReason = "removed";
      m.leftReasonDetail = leftReasonDetail;
      m.leftReasonTitle = leftReasonTitle;
      await m.save();
    }
    // Yopilgan a'zoliklar bo'yicha to'lovlar leftAt bilan qayta proratsiya bo'lsin (C1)
    try {
      await financePaymentService.recalcForStudent(user._id);
    } catch (err) {
      logger.warn({ err }, "Arxivlashda o'quvchi to'lovlari qayta hisoblanmadi");
    }
    try {
      await logArchiveAction({
        user: user._id,
        action: "archive",
        reasonId,
        by: by?._id,
      });
    } catch {
      // log yozilmasa ham arxivlash buzilmasin
    }
  }

  return user;
};

export const restore = async (id, { reasonId, by } = {}) => {
  const user = await getById(id);
  user.isActive = true;
  user.archivedAt = null;
  await user.save();

  if (user.role === ROLES.STUDENT) {
    try {
      await logArchiveAction({
        user: user._id,
        action: "restore",
        reasonId,
        by: by?._id,
      });
    } catch {
      // log yozilmasa ham qaytarish buzilmasin
    }
  }

  return user;
};

// Butunlay o'chirish (soft) - foydalanuvchi + bog'liq hamma narsa isDeleted=true (UI'dan yo'qoladi, hisobdan chiqadi)
export const permanentRemove = async (id, currentUser) => {
  const user = await getById(id);
  await deleteUser(user, currentUser?._id);
  return { _id: user._id };
};

// O'chirilganni qaytarish
export const restoreDeleted = async (id) => {
  const user = await getById(id);
  await restoreUser(user);
  return user;
};

export const studentHistory = async (
  studentId,
  { page = 1, limit = 20 } = {},
) => {
  const user = await getById(studentId);
  if (user.role !== ROLES.STUDENT) {
    throw new ApiError(400, "Bu foydalanuvchi o'quvchi emas");
  }
  const filter = { student: studentId };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    GroupMembership.find(filter)
      .sort({ joinedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("group", { name: 1, schedule: 1 })
      .populate("transferredTo", { name: 1 }),
    GroupMembership.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
