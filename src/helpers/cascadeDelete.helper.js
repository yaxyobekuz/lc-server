// Cascade "haqiqiy o'chirish" (soft) — o'chirilganda ota + bog'liq yozuvlar isDeleted=true bo'ladi.
// Arxiv (isActive) dan FARQLI: bular UI'dan butunlay yashiriladi va barcha hisob-kitobdan chiqariladi.
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import Invoice from "../models/invoice.model.js";
import Payment from "../models/payment.model.js";
import Attendance from "../models/attendance.model.js";
import AttendanceExemption from "../models/attendanceExemption.model.js";
import Discount from "../models/discount.model.js";
import TeacherGroupRate from "../models/teacherGroupRate.model.js";
import TeacherAttendance from "../models/teacherAttendance.model.js";
import TeacherAbsence from "../models/teacherAbsence.model.js";
import Salary from "../models/salary.model.js";
import SalaryPayout from "../models/salaryPayout.model.js";
import { ROLES } from "../constants/roles.js";
import ApiError from "../utils/ApiError.js";
import { recompute } from "../modules/invoices/services/invoices.service.js";

const mark = (deleted, by) =>
  deleted
    ? { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: by || null } }
    : { $set: { isDeleted: false, deletedAt: null, deletedBy: null } };

const setStudentRelated = (studentId, deleted, by) =>
  Promise.all([
    GroupMembership.updateMany({ student: studentId }, mark(deleted, by)),
    Invoice.updateMany({ student: studentId }, mark(deleted, by)),
    Payment.updateMany({ student: studentId }, mark(deleted, by)),
    Attendance.updateMany({ student: studentId }, mark(deleted, by)),
    AttendanceExemption.updateMany({ student: studentId }, mark(deleted, by)),
    Discount.updateMany({ student: studentId }, mark(deleted, by)),
  ]);

const setTeacherRelated = (teacherId, deleted, by) =>
  Promise.all([
    TeacherGroupRate.updateMany({ teacher: teacherId }, mark(deleted, by)),
    Salary.updateMany({ teacher: teacherId }, mark(deleted, by)),
    SalaryPayout.updateMany({ teacher: teacherId }, mark(deleted, by)),
    TeacherAttendance.updateMany({ teacher: teacherId }, mark(deleted, by)),
    TeacherAbsence.updateMany({ teacher: teacherId }, mark(deleted, by)),
  ]);

const setGroupRelated = async (groupId, deleted, by) => {
  const invIds = await Invoice.find({ group: groupId }).distinct("_id");
  await Promise.all([
    GroupMembership.updateMany({ group: groupId }, mark(deleted, by)),
    Invoice.updateMany({ group: groupId }, mark(deleted, by)),
    Payment.updateMany({ invoice: { $in: invIds } }, mark(deleted, by)),
    Attendance.updateMany({ group: groupId }, mark(deleted, by)),
    TeacherGroupRate.updateMany({ group: groupId }, mark(deleted, by)),
    TeacherAbsence.updateMany({ group: groupId }, mark(deleted, by)),
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

// ─── Payment (invoice paidAmount/status qayta hisoblanadi) ───
export const deletePayment = async (paymentId, by) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, "To'lov topilmadi");
  await Payment.updateOne({ _id: paymentId }, mark(true, by));
  await recompute(payment.invoice);
  return payment;
};

export const restorePayment = async (paymentId) => {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new ApiError(404, "To'lov topilmadi");
  await Payment.updateOne({ _id: paymentId }, mark(false));
  await recompute(payment.invoice);
  return payment;
};
