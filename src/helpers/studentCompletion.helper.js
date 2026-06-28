import User from "../models/user.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import { ROLES } from "../constants/roles.js";
import { toUtcMidnight } from "./attendance.helper.js";
import logger from "../config/logger.js";

// O'quvchining "yakunlash sanasi" (completedAt) ni qayta hisoblaydi. Manba ustuvorligi:
//  1) completedAtManual=true → qo'lda override, tegmaymiz.
//  2) archivedAt bor → completedAt = archivedAt (arxiv sanasi).
//  3) faol a'zolik (leftAt=null) bor → null (hali o'qiyapti).
//  4) faol a'zolik yo'q, lekin a'zoliklar bor → eng oxirgi leftAt.
//  5) umuman a'zolik yo'q → null.
// softDelete plugin avtomatik filtr QO'YMAYDI - isDeleted ni qo'lda filtrlash shart.
export const recomputeStudentCompletion = async (studentId, { session } = {}) => {
  const user = await User.findById(studentId).session(session || null);
  if (!user || user.role !== ROLES.STUDENT) return;
  if (user.completedAtManual) return;

  let completedAt = null;
  if (user.archivedAt) {
    completedAt = toUtcMidnight(user.archivedAt);
  } else {
    const memberships = await GroupMembership.find({
      student: studentId,
      isDeleted: { $ne: true },
    })
      .select("leftAt")
      .session(session || null)
      .lean();

    const hasActive = memberships.some((m) => !m.leftAt);
    if (!hasActive && memberships.length > 0) {
      const maxLeft = memberships.reduce((max, m) => {
        const t = new Date(m.leftAt).getTime();
        return t > max ? t : max;
      }, 0);
      if (maxLeft > 0) completedAt = toUtcMidnight(new Date(maxLeft));
    }
  }

  const current = user.completedAt ? new Date(user.completedAt).getTime() : null;
  const next = completedAt ? completedAt.getTime() : null;
  if (current !== next) {
    user.completedAt = completedAt;
    await user.save({ session });
  }
};

// Xato bo'lsa ham asosiy oqim buzilmasligi uchun best-effort variant.
export const safeRecomputeStudentCompletion = async (studentId, opts) => {
  try {
    await recomputeStudentCompletion(studentId, opts);
  } catch (err) {
    logger.warn({ err, studentId }, "completedAt qayta hisoblanmadi");
  }
};
