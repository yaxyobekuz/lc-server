import GroupMembership from "../models/groupMembership.model.js";
import Group from "../models/group.model.js";
import ApiError from "../utils/ApiError.js";

// O'quvchining faol (leftAt=null) guruh a'zoligi bormi.
// isDeleted filtri shart (P-9): soft-delete qilingan a'zolik "faol" deb
// sanalmasligi kerak - aks holda o'chirilgan o'quvchi tekshiruvdan o'tib ketardi.
export const hasActiveGroup = async (studentId, session) => {
  const query = GroupMembership.exists({
    student: studentId,
    leftAt: null,
    isDeleted: { $ne: true },
  });
  if (session) query.session(session);
  return Boolean(await query);
};

// O'quvchi aynan shu guruhda faolmi (leftAt=null)
export const isActiveInGroup = async (studentId, groupId, session) => {
  const query = GroupMembership.exists({
    student: studentId,
    group: groupId,
    leftAt: null,
    isDeleted: { $ne: true },
  });
  if (session) query.session(session);
  return Boolean(await query);
};

// Faol guruh bo'lmasa amalni rad etadi (to'lov, chegirma, ozod davri va h.k.)
export const ensureActiveGroup = async (studentId, session) => {
  if (!(await hasActiveGroup(studentId, session))) {
    throw new ApiError(
      400,
      "O'quvchi hech qaysi guruhda emas. Avval o'quvchini guruhga qo'shing.",
    );
  }
};

// O'qituvchi shu o'quvchiga ega bo'lgan guruhlardan biriga biriktirilganmi.
// O'quvchi o'qituvchining guruhlaridan birida (leftAt yoki tarix - farqi yo'q)
// a'zo bo'lishi yetarli (ozod davri tarixiy a'zolik uchun ham tuzilishi mumkin).
// Boshqa rollar (owner) bu tekshiruvni umuman ishlatmaydi.
export const ensureTeacherOwnsStudent = async (teacherId, studentId) => {
  const groups = await Group.find({ teachers: teacherId }).select("_id").lean();
  const groupIds = groups.map((g) => g._id);
  if (groupIds.length === 0) {
    throw new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas");
  }
  const membership = await GroupMembership.exists({
    student: studentId,
    group: { $in: groupIds },
    isDeleted: { $ne: true },
  });
  if (!membership) {
    throw new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas");
  }
};
