import GroupMembership from "../models/groupMembership.model.js";
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
