import GroupMembership from "../models/groupMembership.model.js";
import ApiError from "../utils/ApiError.js";

// Talabaning faol (leftAt=null) guruh a'zoligi bormi
export const hasActiveGroup = async (studentId, session) => {
  const query = GroupMembership.exists({ student: studentId, leftAt: null });
  if (session) query.session(session);
  return Boolean(await query);
};

// Faol guruh bo'lmasa amalni rad etadi (to'lov, chegirma, ozod davri va h.k.)
export const ensureActiveGroup = async (studentId, session) => {
  if (!(await hasActiveGroup(studentId, session))) {
    throw new ApiError(
      400,
      "Talaba hech qaysi guruhda emas. Avval talabani guruhga qo'shing.",
    );
  }
};
