import mongoose from "mongoose";
import TeacherSalaryConfig from "../../../models/teacherSalaryConfig.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { localTodayMidnight } from "../../../helpers/attendance.helper.js";
import {
  ensureSalaryForTeacherGroup,
  recalc,
} from "./teacherSalary.service.js";

const safeTeacherProjection = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
};

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const pairKey = (teacher, group) => `${teacher}:${group}`;

// Generatsiya uchun: berilgan (teacher, group) juftliklari bo'yicha saqlangan
// config'larni Map (key=`teacher:group`) qilib qaytaradi. ensureSalaryForTeacherGroup
// shu yerdan stabil maosh qoidasini oladi.
export const getConfigMap = async (pairs) => {
  if (!pairs.length) return new Map();
  const or = pairs.map((p) => ({
    teacher: toObjectId(p.teacher),
    group: toObjectId(p.group),
  }));
  const rows = await TeacherSalaryConfig.find({ $or: or }).lean();
  return new Map(rows.map((r) => [pairKey(r.teacher, r.group), r]));
};

// Bitta (teacher, group) config'i (generation fallback uchun ham ishlatiladi).
export const getConfig = async (teacher, group) =>
  TeacherSalaryConfig.findOne({
    teacher: toObjectId(teacher),
    group: toObjectId(group),
  }).lean();

// Barcha faol guruhlarning (teacher, group) juftliklarini sanab, saqlangan
// config bilan birlashtiradi. Config hali belgilanmagan juftliklar ham
// ko'rinadi (configured:false) - owner kimga foiz qo'yilmaganini ko'rsin.
export const list = async ({ groupId, teacherId, search } = {}) => {
  const groupFilter = {
    isActive: true,
    status: "active",
    isDeleted: { $ne: true },
  };
  if (groupId) groupFilter._id = toObjectId(groupId);

  const groups = await Group.find(groupFilter, { name: 1, teachers: 1 }).lean();

  // (teacher, group) juftliklarini yig'amiz
  const pairs = [];
  const teacherIds = new Set();
  for (const g of groups) {
    for (const t of g.teachers || []) {
      if (teacherId && String(t) !== String(teacherId)) continue;
      pairs.push({ teacher: t, group: g });
      teacherIds.add(String(t));
    }
  }
  if (!pairs.length) return [];

  // O'qituvchi ma'lumotlari (faqat haqiqiy o'qituvchilar)
  const teachers = await User.find(
    { _id: { $in: [...teacherIds] }, role: ROLES.TEACHER, isDeleted: { $ne: true } },
    safeTeacherProjection,
  ).lean();
  const teacherById = new Map(teachers.map((t) => [String(t._id), t]));

  const configMap = await getConfigMap(
    pairs.map((p) => ({ teacher: p.teacher, group: p.group._id })),
  );

  let items = pairs
    .map((p) => {
      const teacher = teacherById.get(String(p.teacher));
      if (!teacher) return null; // o'qituvchi emas / o'chirilgan
      const cfg = configMap.get(pairKey(p.teacher, p.group._id));
      return {
        teacher,
        group: { _id: p.group._id, name: p.group.name },
        configured: !!cfg,
        salaryType: cfg ? cfg.salaryType : "percent",
        fixedAmount: cfg ? cfg.fixedAmount : 0,
        percentRate: cfg ? cfg.percentRate : 0,
        updatedAt: cfg ? cfg.updatedAt : null,
      };
    })
    .filter(Boolean);

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    items = items.filter((it) => {
      const hay = [it.teacher.firstName, it.teacher.lastName, it.teacher.username, it.group.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }

  // Avval config belgilanmaganlar (e'tibor talab qiladi), keyin ism bo'yicha
  items.sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? 1 : -1;
    const an = `${a.teacher.firstName} ${a.teacher.lastName}`;
    const bn = `${b.teacher.firstName} ${b.teacher.lastName}`;
    return an.localeCompare(bn);
  });

  return items;
};

// Stabil maosh config'ini saqlaydi, so'ng JORIY va KELAJAK oylik maoshlarga
// qo'llaydi (o'tgan/to'langan oylar tegmaydi). Joriy oy yozuvi bo'lmasa yaratadi.
export const upsert = async (
  { teacher, group, salaryType, fixedAmount, percentRate },
  currentUser,
) => {
  const grp = await Group.findById(group);
  if (!grp) throw new ApiError(404, "Guruh topilmadi");

  const teacherDoc = await User.findOne({
    _id: teacher,
    role: ROLES.TEACHER,
    isDeleted: { $ne: true },
  });
  if (!teacherDoc) throw new ApiError(400, "O'qituvchi topilmadi");

  // O'qituvchi shu guruhga biriktirilganini tekshiramiz
  const attached = (grp.teachers || []).some((t) => String(t) === String(teacher));
  if (!attached) {
    throw new ApiError(400, "O'qituvchi bu guruhga biriktirilmagan");
  }

  const normFixed = salaryType === "percent" ? 0 : Math.max(0, fixedAmount || 0);
  const normPercent = salaryType === "fixed" ? 0 : Math.max(0, Math.min(100, percentRate || 0));

  const config = await TeacherSalaryConfig.findOneAndUpdate(
    { teacher, group },
    {
      $set: {
        salaryType,
        fixedAmount: normFixed,
        percentRate: normPercent,
        updatedBy: currentUser?._id || null,
      },
      $setOnInsert: { teacher, group, createdBy: currentUser?._id || null },
    },
    { upsert: true, new: true },
  );

  // Joriy + kelajak oylik maoshlarga qo'llaymiz.
  const today = localTodayMidnight();
  const curYear = today.getUTCFullYear();
  const curMonth = today.getUTCMonth() + 1;
  const curIdx = curYear * 12 + (curMonth - 1);

  // Mavjud (joriy yoki kelajak) oylik yozuvlarni config'ga moslab qayta hisoblaymiz.
  const existing = await TeacherSalary.find({ teacher, group });
  let updated = 0;
  let currentExists = false;
  for (const s of existing) {
    const idx = s.year * 12 + (s.month - 1);
    if (idx < curIdx) continue; // o'tgan oy - tegmaymiz
    if (idx === curIdx) currentExists = true;
    s.salaryType = salaryType;
    s.fixedAmount = normFixed;
    s.percentRate = normPercent;
    s.source = "manual";
    await s.save();
    await recalc(s._id);
    updated += 1;
  }

  // Joriy oy yozuvi hali yo'q bo'lsa - yaratamiz (config bo'yicha hisoblanadi).
  if (!currentExists) {
    const created = await ensureSalaryForTeacherGroup(teacher, group, curYear, curMonth);
    if (created) updated += 1;
  }

  return { config, applied: updated };
};

// Config'ni o'chiradi (kelgusi generatsiya carry-forward / default'ga qaytadi).
export const remove = async (teacher, group) => {
  const res = await TeacherSalaryConfig.findOneAndDelete({ teacher, group });
  if (!res) throw new ApiError(404, "Sozlama topilmadi");
  return { _id: res._id };
};
