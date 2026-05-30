import TeacherAbsence from "../../../models/teacherAbsence.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import ApiError from "../../../utils/ApiError.js";
import {
  toUtcMidnight,
  dateKeyOf,
  dayOfWeekOf,
} from "../../../helpers/attendance.helper.js";
import { computePerLessonAmount } from "../../../helpers/billing.helper.js";
import { get as getSettings } from "../../paymentSettings/services/paymentSettings.service.js";
import {
  ensureInvoiceFor,
  applyAbsenceDeduction,
  reverseAbsenceDeduction,
} from "../../invoices/services/invoices.service.js";

const periodOf = (date) => {
  const d = new Date(date);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

const isClassDayFor = (group, dow) =>
  (group.schedule || []).some((s) => s.day === dow);

// O'qituvchi shu kuni keldimi + 1 dars haqi preview
export const getStatus = async (groupId, dateInput) => {
  const group = await Group.findById(groupId);
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  const date = toUtcMidnight(dateInput);
  const dKey = dateKeyOf(date);
  const settings = await getSettings();
  const perStudentAmount = computePerLessonAmount(group, periodOf(date), settings);
  const absence = await TeacherAbsence.findOne({ group: groupId, dateKey: dKey });
  return {
    dateKey: dKey,
    isClassDay: isClassDayFor(group, dayOfWeekOf(date)),
    present: !absence,
    perStudentAmount,
    affectedCount: absence?.applications?.length || 0,
  };
};

// O'qituvchi kelmadi → har bir faol o'quvchining shu oygi hisobidan 1 dars haqi ayiriladi
export const setAbsent = async (groupId, dateInput, currentUser) => {
  const group = await Group.findById(groupId);
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  const date = toUtcMidnight(dateInput);
  const dKey = dateKeyOf(date);
  if (!isClassDayFor(group, dayOfWeekOf(date))) {
    throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
  }

  const existing = await TeacherAbsence.findOne({ group: groupId, dateKey: dKey });
  if (existing) return existing;

  const settings = await getSettings();
  const period = periodOf(date);
  const perStudent = computePerLessonAmount(group, period, settings);

  const memberships = await GroupMembership.find({
    group: groupId,
    joinedAt: { $lte: date },
    $or: [{ leftAt: null }, { leftAt: { $gt: date } }],
  });

  const applications = [];
  if (perStudent > 0) {
    for (const m of memberships) {
      const invoice = await ensureInvoiceFor(m.student, groupId, m._id, period, {
        createdBy: currentUser._id,
      });
      if (!invoice) continue;
      const res = await applyAbsenceDeduction(invoice._id, perStudent);
      applications.push({ student: m.student, invoice: invoice._id, ...res });
    }
  }

  return TeacherAbsence.create({
    group: groupId,
    teacher: group.teachers?.[0] || null,
    date,
    dateKey: dKey,
    perStudentAmount: perStudent,
    applications,
    recordedBy: currentUser._id,
  });
};

// O'qituvchi keldi (orqaga qaytarish) → barcha chegirmalar bekor qilinadi
export const setPresent = async (groupId, dateInput) => {
  const date = toUtcMidnight(dateInput);
  const dKey = dateKeyOf(date);
  const absence = await TeacherAbsence.findOne({ group: groupId, dateKey: dKey });
  if (!absence) return { removed: false };
  for (const app of absence.applications || []) {
    await reverseAbsenceDeduction(app.invoice, app);
  }
  await TeacherAbsence.deleteOne({ _id: absence._id });
  return { removed: true };
};

export const toggle = async (groupId, dateInput, present, currentUser) =>
  present
    ? setPresent(groupId, dateInput)
    : setAbsent(groupId, dateInput, currentUser);
