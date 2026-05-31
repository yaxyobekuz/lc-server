import GroupMembership from "../models/groupMembership.model.js";
import ApiError from "../utils/ApiError.js";

// O'quvchining faol (leftAt=null) guruh a'zoligi bormi
export const hasActiveGroup = async (studentId, session) => {
  const query = GroupMembership.exists({ student: studentId, leftAt: null });
  if (session) query.session(session);
  return Boolean(await query);
};

// O'quvchi aynan shu guruhda faolmi (leftAt=null)
export const isActiveInGroup = async (studentId, groupId, session) => {
  const query = GroupMembership.exists({
    student: studentId,
    group: groupId,
    leftAt: null,
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
