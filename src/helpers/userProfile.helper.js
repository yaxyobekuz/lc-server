import User from "../models/user.model.js";
import BotUser from "../models/botUser.model.js";
import { ROLES } from "../constants/roles.js";
import {
  list as listGroups,
  findAllActiveForStudent,
  findPendingRemovalNotice,
} from "../modules/groups/services/groups.service.js";

const calcYears = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let years =
    today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) {
    years -= 1;
  }
  return years >= 0 ? years : null;
};

const sanitizeUser = (user) => {
  const obj = user.toJSON ? user.toJSON() : user;
  delete obj.passwordHash;
  return obj;
};

const fetchTelegram = async (userId) => {
  const bot = await BotUser.findOne({ user: userId }).lean();
  if (!bot) return null;
  return {
    telegramId: bot.telegramId,
    username: bot.username,
    firstName: bot.firstName,
    lastName: bot.lastName,
    languageCode: bot.languageCode,
  };
};

export const buildUserProfile = async (userInput) => {
  let user = userInput;
  if (typeof user === "string" || (user && user._bsontype === "ObjectID")) {
    user = await User.findById(user);
  }
  if (!user) return null;

  const base = sanitizeUser(user);
  const telegram = await fetchTelegram(user._id);

  if (user.role === ROLES.STUDENT) {
    const activeGroups = await findAllActiveForStudent(user._id);

    // Guruhdan chiqarilgan bo'lsa - login qilganda bir marta xabar (modal) uchun.
    const removalNotice = await findPendingRemovalNotice(user._id);

    // Davomat summary (joriy oy) - lazy import (circular dependency oldini olish)
    const { getStudentSummary: getAttSummary } = await import(
      "../modules/attendance/services/attendance.service.js"
    );
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
    const attendanceSummary = await getAttSummary(user._id, {
      fromDate: monthStart,
      toDate: monthEnd,
    });

    return {
      ...base,
      activeGroups,
      attendanceSummary,
      removalNotice,
      telegram,
    };
  }

  if (user.role === ROLES.TEACHER) {
    const { items } = await listGroups({
      teacherId: user._id,
      page: 1,
      limit: 100,
    });
    const groups = items.map((g) => ({
      _id: g._id,
      name: g.name,
      schedule: g.schedule,
      studentsCount: g.studentsCount || 0,
    }));

    return {
      ...base,
      age: calcYears(user.birthDate),
      years: calcYears(user.hiredAt),
      groups,
      telegram,
    };
  }

  // Owner yoki boshqa rollar - minimal profile
  return {
    ...base,
    age: calcYears(user.birthDate),
    telegram,
  };
};
