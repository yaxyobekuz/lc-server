// Cascade "haqiqiy o'chirish" (soft) - o'chirilganda ota + bog'liq yozuvlar isDeleted=true bo'ladi.
// Arxiv (isActive) dan FARQLI: bular UI'dan butunlay yashiriladi va barcha hisob-kitobdan chiqariladi.
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import Attendance from "../models/attendance.model.js";
import AttendanceExemption from "../models/attendanceExemption.model.js";
import TeacherAttendance from "../models/teacherAttendance.model.js";
import TeacherAbsence from "../models/teacherAbsence.model.js";
import StudentPayment from "../models/studentPayment.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import TeacherSalary from "../models/teacherSalary.model.js";
import SalaryTransaction from "../models/salaryTransaction.model.js";
import { ROLES } from "../constants/roles.js";
import ApiError from "../utils/ApiError.js";

const mark = (deleted, by) =>
  deleted
    ? { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: by || null } }
    : { $set: { isDeleted: false, deletedAt: null, deletedBy: null } };

const setStudentRelated = (studentId, deleted, by) =>
  Promise.all([
    GroupMembership.updateMany({ student: studentId }, mark(deleted, by)),
    Attendance.updateMany({ student: studentId }, mark(deleted, by)),
    AttendanceExemption.updateMany({ student: studentId }, mark(deleted, by)),
    // Moliya yozuvlari ham chiqarilsin - aks holda o'chirilgan o'quvchi
    // hisobotlarda (kirim/qarz) sanalib turardi.
    StudentPayment.updateMany({ student: studentId }, mark(deleted, by)),
    PaymentTransaction.updateMany({ student: studentId }, mark(deleted, by)),
  ]);

const setTeacherRelated = (teacherId, deleted, by) =>
  Promise.all([
    TeacherAttendance.updateMany({ teacher: teacherId }, mark(deleted, by)),
    TeacherAbsence.updateMany({ teacher: teacherId }, mark(deleted, by)),
    TeacherSalary.updateMany({ teacher: teacherId }, mark(deleted, by)),
    SalaryTransaction.updateMany({ teacher: teacherId }, mark(deleted, by)),
  ]);

const setGroupRelated = async (groupId, deleted, by) => {
  await Promise.all([
    GroupMembership.updateMany({ group: groupId }, mark(deleted, by)),
    Attendance.updateMany({ group: groupId }, mark(deleted, by)),
    TeacherAbsence.updateMany({ group: groupId }, mark(deleted, by)),
    StudentPayment.updateMany({ group: groupId }, mark(deleted, by)),
    PaymentTransaction.updateMany({ group: groupId }, mark(deleted, by)),
    TeacherSalary.updateMany({ group: groupId }, mark(deleted, by)),
    SalaryTransaction.updateMany({ group: groupId }, mark(deleted, by)),
  ]);
};

// ─── User (role bo'yicha) ───
export const deleteUser = async (user, by) => {
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }
  await User.updateOne({ _id: user._id }, mark(true, by));
  if (user.role === ROLES.TEACHER) await setTeacherRelated(user._id, true, by);
  else await setStudentRelated(user._id, true, by);
};

export const restoreUser = async (user) => {
  await User.updateOne({ _id: user._id }, mark(false));
  if (user.role === ROLES.TEACHER) await setTeacherRelated(user._id, false);
  else await setStudentRelated(user._id, false);
};

// ─── Group ───
export const deleteGroup = async (groupId, by) => {
  await Group.updateOne({ _id: groupId }, mark(true, by));
  await setGroupRelated(groupId, true, by);
};

export const restoreGroup = async (groupId) => {
  await Group.updateOne({ _id: groupId }, mark(false));
  await setGroupRelated(groupId, false);
};
