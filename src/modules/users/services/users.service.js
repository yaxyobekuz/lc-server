import User from "../../../models/user.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Invoice from "../../../models/invoice.model.js";
import RefreshToken from "../../../models/refreshToken.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { normalizePhone } from "../../../utils/phone.js";
import { hashPassword } from "../../../helpers/password.helper.js";
import { buildUserProfile } from "../../../helpers/userProfile.helper.js";
import { toUtcMidnight } from "../../../helpers/attendance.helper.js";
import { reconcileOnLeave } from "../../invoices/services/invoices.service.js";
import { deleteUser, restoreUser } from "../../../helpers/cascadeDelete.helper.js";

const STUDENT_ONLY_FIELDS = ["enrolledAt", "leaveStatus"];
const TEACHER_ONLY_FIELDS = [
  "hiredAt",
  "teacherAbsenceMode",
  "teacherAbsenceAmount",
];

// Ro'yxatda saralash mumkin bo'lgan maydonlar (xavfsiz oq ro'yxat).
// `debt` — maxsus: u User hujjatida yo'q, qarz hisoblangach JS'da saralanadi.
const USER_SORT_FIELDS = {
  createdAt: "createdAt",
  firstName: "firstName",
  lastName: "lastName",
};

// O'quvchilar ro'yxatiga qarz (currentDebt) va faol guruhlarni qo'shadi —
// ro'yxatdan profil ochmasdan ko'rinishi uchun (at-a-glance).
const enrichStudents = async (items) => {
  const studentIds = items
    .filter((u) => u.role === ROLES.STUDENT)
    .map((u) => u._id);
  if (studentIds.length === 0) return items.map((u) => u.toObject());

  const [debtRows, membershipRows] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          student: { $in: studentIds },
          status: { $in: ["unpaid", "partial"] },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$student",
          debt: { $sum: { $subtract: ["$totalDue", "$paidAmount"] } },
        },
      },
    ]),
    GroupMembership.find({ student: { $in: studentIds }, leftAt: null })
      .populate("group", { name: 1 })
      .lean(),
  ]);

  const debtMap = new Map(debtRows.map((d) => [String(d._id), d.debt]));
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
      obj.currentDebt = debtMap.get(String(u._id)) || 0;
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
  // `debt` bo'yicha saralash maxsus: qarz aggregatsiyada hisoblanadi.
  // Bunda butun mos to'plamni olib (DB sort'siz), qarzni biriktirib, JS'da
  // saralaymiz va keyin sahifalaymiz — to'g'ri tartib ta'minlanadi.
  const sortByDebt = sort === "debt" && (!role || role === ROLES.STUDENT);

  const skip = (page - 1) * limit;

  if (sortByDebt) {
    const [all, total] = await Promise.all([
      User.find(filter),
      User.countDocuments(filter),
    ]);
    const enriched = await enrichStudents(all);
    enriched.sort((a, b) => ((a.currentDebt || 0) - (b.currentDebt || 0)) * dir);
    const items = enriched.slice(skip, skip + limit);
    return { items, total, page, limit };
  }

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
    if (body.leaveStatus !== undefined) {
      user.leaveStatus = body.leaveStatus || null;
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
    if (body.teacherAbsenceMode !== undefined) {
      user.teacherAbsenceMode = body.teacherAbsenceMode;
    }
    if (body.teacherAbsenceAmount !== undefined) {
      user.teacherAbsenceAmount = Math.max(0, Number(body.teacherAbsenceAmount) || 0);
    }
  }

  await user.save();
  return user;
};

// Owner uchun: foydalanuvchining ochiq parolini ko'rsatish
export const getPassword = async (id) => {
  const user = await User.findById(id).select("+plainPassword username role");
  if (!user) throw new ApiError(404, "Foydalanuvchi topilmadi");
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini ko'rib bo'lmaydi");
  }
  return { username: user.username, password: user.plainPassword || "" };
};

// Owner uchun: foydalanuvchiga yangi parol o'rnatish
export const setPassword = async (id, newPassword) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner parolini o'zgartirib bo'lmaydi");
  }
  user.passwordHash = await hashPassword(newPassword);
  user.plainPassword = newPassword;
  await user.save();

  // Parol o'zgargach barcha eski sessiyalarni bekor qilamiz
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );

  return { username: user.username, password: newPassword };
};

export const softRemove = async (id) => {
  const user = await getById(id);
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }
  user.isActive = false;
  await user.save();

  // O'quvchi arxivlansa — faol a'zoliklarni yopamiz va joriy oy hisobini o'qigan qismiga (qarz) moslaymiz.
  // Arxivdan keyingi oylarga hisob umuman yozilmaydi (generateForPeriod isActive=false ni o'tkazib yuboradi).
  if (user.role === ROLES.STUDENT) {
    const today = toUtcMidnight(new Date());
    const period = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
    const memberships = await GroupMembership.find({
      student: user._id,
      leftAt: null,
    }).populate("group");
    for (const m of memberships) {
      m.leftAt = today;
      m.leftReason = "removed";
      await m.save();
      if (m.group) {
        await reconcileOnLeave(user._id, m.group, m._id, period, today, {});
      }
    }
  }

  return user;
};

export const restore = async (id) => {
  const user = await getById(id);
  user.isActive = true;
  await user.save();
  return user;
};

// Butunlay o'chirish (soft) — foydalanuvchi + bog'liq hamma narsa isDeleted=true (UI'dan yo'qoladi, hisobdan chiqadi)
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
