// PROYEKSIYA xizmati: TeacherAbsence (per-guruh "o'qituvchi kelmadi") yozuvlari
// TeacherAttendance (manba-haqiqat) dan teacherAttendance.service orqali hosil
// qilinadi - maosh/chegirma hisobiga ishlatiladi. Mustaqil haqiqat sifatida
// qaramang. To'liq tafsilot: modules/teacherAttendance/services/teacherAttendance.service.js
import TeacherAbsence from "../../../models/teacherAbsence.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import {
  parseLocalDay,
  dateKeyOf,
  dayOfWeekOf,
  scheduleActiveOn,
  localTodayMidnight,
} from "../../../helpers/attendance.helper.js";

const parseDay = (dateInput) => {
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  return date;
};

// Shu sanada AMAL QILGAN jadval versiyasi bo'yicha (versiyalash)
const isClassDayFor = (group, dow, date = null) =>
  scheduleActiveOn(group.schedule, date).some((s) => s.day === dow);

// O'qituvchi shu kuni keldimi (faqat fakt - o'quvchilar hisobiga ta'sir qilmaydi)
export const getStatus = async (groupId, dateInput) => {
  const group = await Group.findById(groupId);
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  const date = parseDay(dateInput);
  const dKey = dateKeyOf(date);
  const absence = await TeacherAbsence.findOne({ group: groupId, dateKey: dKey });
  return {
    dateKey: dKey,
    isClassDay: isClassDayFor(group, dayOfWeekOf(date), date),
    present: !absence,
  };
};

// O'qituvchi kelmadi - faqat belgilab qo'yiladi. O'quvchilar to'loviga TEGMAYDI.
// Jarima kerak bo'lsa, admin o'qituvchi maoshiga qo'lda yozadi (individual).
export const setAbsent = async (groupId, dateInput, currentUser) => {
  const group = await Group.findById(groupId);
  if (!group) throw new ApiError(404, "Guruh topilmadi");
  const date = parseDay(dateInput);
  const dKey = dateKeyOf(date);
  // Kelajak sanaga "kelmadi" yozib bo'lmaydi (bulkRecord bilan bir xil qoida)
  if (date.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Kelajak sanaga davomat belgilab bo'lmaydi");
  }
  if (!isClassDayFor(group, dayOfWeekOf(date), date)) {
    throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
  }

  const existing = await TeacherAbsence.findOne({ group: groupId, dateKey: dKey });
  if (existing) return existing;

  return TeacherAbsence.create({
    group: groupId,
    teacher: group.teachers?.[0] || null,
    date,
    dateKey: dKey,
    recordedBy: currentUser._id,
  });
};

// O'qituvchi keldi - belgini olib tashlaymiz.
export const setPresent = async (groupId, dateInput) => {
  const date = parseDay(dateInput);
  const dKey = dateKeyOf(date);
  const res = await TeacherAbsence.deleteOne({ group: groupId, dateKey: dKey });
  return { removed: res.deletedCount > 0 };
};

export const toggle = async (groupId, dateInput, present, currentUser) =>
  present
    ? setPresent(groupId, dateInput)
    : setAbsent(groupId, dateInput, currentUser);
