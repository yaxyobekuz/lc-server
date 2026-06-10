import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import { ROLES } from "../../../constants/roles.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Global qidiruv: bitta so'rov bilan o'quvchi, o'qituvchi va guruhlarni topadi.
// ⌘K oynasi shu natijalarni ko'rsatadi - foydalanuvchi profil/guruhga to'g'ridan o'tadi.
export const globalSearch = async (term, { limit = 5 } = {}) => {
  const q = (term || "").trim();
  if (q.length < 2) return { students: [], teachers: [], groups: [] };

  const rx = new RegExp(escapeRegex(q), "i");
  const userMatch = {
    isActive: true,
    isDeleted: { $ne: true },
    $or: [{ firstName: rx }, { lastName: rx }, { phone: rx }, { username: rx }],
  };

  const [students, teachers, groups] = await Promise.all([
    User.find({ ...userMatch, role: ROLES.STUDENT })
      .select("firstName lastName phone role")
      .limit(limit)
      .lean(),
    User.find({ ...userMatch, role: ROLES.TEACHER })
      .select("firstName lastName phone role")
      .limit(limit)
      .lean(),
    Group.find({
      isActive: true,
      isDeleted: { $ne: true },
      name: rx,
    })
      .select("name")
      .limit(limit)
      .lean(),
  ]);

  // Guruhlar uchun o'quvchilar sonini ko'rsatamiz (yengil kontekst)
  const groupIds = groups.map((g) => g._id);
  let countMap = new Map();
  if (groupIds.length > 0) {
    const countRows = await GroupMembership.aggregate([
      { $match: { group: { $in: groupIds }, leftAt: null } },
      { $group: { _id: "$group", count: { $sum: 1 } } },
    ]);
    countMap = new Map(countRows.map((c) => [String(c._id), c.count]));
  }

  return {
    students: students.map((s) => ({
      _id: s._id,
      firstName: s.firstName,
      lastName: s.lastName,
      phone: s.phone || null,
    })),
    teachers: teachers.map((t) => ({
      _id: t._id,
      firstName: t.firstName,
      lastName: t.lastName,
      phone: t.phone || null,
    })),
    groups: groups.map((g) => ({
      _id: g._id,
      name: g.name,
      studentsCount: countMap.get(String(g._id)) || 0,
    })),
  };
};
