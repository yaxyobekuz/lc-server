import mongoose from "mongoose";
import TeacherSalaryRatePeriod from "../../../models/teacherSalaryRatePeriod.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as salaryRatePeriodService from "./salaryRatePeriod.service.js";

// MANBA HAQIQATI endi TeacherSalaryRatePeriod (oy-darajali stavka davrlari).
// Bu fayl eski "stabil config" HTTP shaklini saqlaydigan COMPAT qatlam:
// "config" = shu pair'ning HOZIRGI ochiq stavka davri. (Phase 4 da UI timeline.)

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

// Barcha faol guruh (teacher, group) juftliklari + joriy ochiq stavka davri.
export const list = async ({ groupId, teacherId, search } = {}) => {
  const groupFilter = { isActive: true, status: "active", isDeleted: { $ne: true } };
  if (groupId) groupFilter._id = toObjectId(groupId);

  const groups = await Group.find(groupFilter, { name: 1, teachers: 1 }).lean();

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

  const teachers = await User.find(
    { _id: { $in: [...teacherIds] }, role: ROLES.TEACHER, isDeleted: { $ne: true } },
    safeTeacherProjection,
  ).lean();
  const teacherById = new Map(teachers.map((t) => [String(t._id), t]));

  // Har pair uchun ochiq (tugamagan) stavka davri = joriy "stabil" qoida.
  const openPeriods = await TeacherSalaryRatePeriod.find({
    teacher: { $in: [...teacherIds].map((id) => toObjectId(id)) },
    group: { $in: groups.map((g) => g._id) },
    endYear: null,
  }).lean();
  const openByPair = new Map(
    openPeriods.map((p) => [`${p.teacher}:${p.group}`, p]),
  );

  let items = pairs
    .map((p) => {
      const teacher = teacherById.get(String(p.teacher));
      if (!teacher) return null;
      const cfg = openByPair.get(`${p.teacher}:${p.group._id}`);
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

  items.sort((a, b) => {
    if (a.configured !== b.configured) return a.configured ? 1 : -1;
    const an = `${a.teacher.firstName} ${a.teacher.lastName}`;
    const bn = `${b.teacher.firstName} ${b.teacher.lastName}`;
    return an.localeCompare(bn);
  });

  return items;
};

// Stabil stavka belgilaydi → "shu oydan boshlab stavka = X" ochiq davri.
// O'tgan/to'langan oylar tegmaydi (davr joriy oydan boshlanadi).
export const upsert = async (
  { teacher, group, salaryType, fixedAmount, percentRate },
  currentUser,
) => {
  const grp = await Group.findById(group);
  if (!grp) throw new ApiError(404, "Guruh topilmadi");
  const attached = (grp.teachers || []).some((t) => String(t) === String(teacher));
  if (!attached) throw new ApiError(400, "O'qituvchi bu guruhga biriktirilmagan");

  const today = localTodayMidnight();
  const period = await salaryRatePeriodService.setRateFrom(
    {
      teacher,
      group,
      salaryType,
      fixedAmount,
      percentRate,
      year: today.getUTCFullYear(),
      month: today.getUTCMonth() + 1,
    },
    currentUser,
  );
  return { config: period };
};

// Stabil stavkani bekor qiladi - ochiq stavka davrini o'chiradi.
export const remove = async (teacher, group) => {
  const open = await TeacherSalaryRatePeriod.findOne({
    teacher: toObjectId(teacher),
    group: toObjectId(group),
    endYear: null,
  });
  if (!open) throw new ApiError(404, "Sozlama topilmadi");
  return salaryRatePeriodService.remove(open._id);
};
