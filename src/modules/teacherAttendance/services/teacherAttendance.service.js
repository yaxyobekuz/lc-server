// ─────────────────────────────────────────────────────────────────────────────
// O'QITUVCHI DAVOMATI ARXITEKTURASI (manba-haqiqat hujjati)
//
// Ikkita kolleksiya ataylab ishlatiladi va ROLLARI HAR XIL:
//   1) TeacherAttendance  → MANBA-HAQIQAT. Har (teacher, dateKey) uchun bitta
//      kunlik yozuv. Holatlar: present | absent | excused ("exempt" YO'Q -
//      o'qituvchida imtiyoz tushunchasi bo'lmaydi). Owner shu yerda belgilaydi.
//   2) TeacherAbsence     → PROYEKSIYA. Bu yozuvdan kelib chiqib, dars kuni bo'lgan
//      har bir GURUH uchun "o'qituvchi kelmadi" belgisi (maosh/chegirma hisobiga).
//      syncTeacherGroupAbsences() orqali TeacherAttendance'dan AVTOMATIK hosil
//      qilinadi - uni mustaqil "haqiqat" sifatida YOZMANG.
//
// Ya'ni: yoz → TeacherAttendance; o'qi (guruh darajasi) → TeacherAbsence (derived).
// Kelajak-kun qo'riqlovi student davomati bilan bir xil: localTodayKey (Asia/Tashkent).
// To'liq bitta modelga birlashtirish maosh hisobiga ta'sir qilgani uchun ataylab
// QILINMAGAN (parity + hujjat yondashuvi).
// ─────────────────────────────────────────────────────────────────────────────
import TeacherAttendance, {
  TEACHER_ATTENDANCE_STATUSES,
} from "../../../models/teacherAttendance.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  dateKeyOf,
  dayOfWeekOf,
  localTodayKey,
  parseLocalDay,
  scheduleActiveOn,
} from "../../../helpers/attendance.helper.js";
import {
  setAbsent as setGroupTeacherAbsent,
  setPresent as setGroupTeacherPresent,
} from "../../attendance/services/teacherAbsence.service.js";

const TEACHER_PROJECTION = { firstName: 1, lastName: 1, username: 1 };

// Shu sanada AMAL QILGAN jadval versiyasi bo'yicha (versiyalash)
const isClassDayFor = (group, dow, date = null) =>
  scheduleActiveOn(group.schedule, date).some((s) => s.day === dow);

// O'qituvchi kunlik davomatini uning barcha (faol, yakunlanmagan) guruhlaridagi
// "o'qituvchi keldi/kelmadi" bilan moslaydi. Kelmadi → dars kuni bo'lgan guruhlarga
// "kelmadi" yoziladi; keldi → o'sha guruhlardagi belgilar olib tashlanadi.
const syncTeacherGroupAbsences = async (teacherId, date, isAbsent, currentUser) => {
  const dow = dayOfWeekOf(date);
  const groups = await Group.find({
    teachers: teacherId,
    isActive: true,
  }).select("schedule teachers");
  for (const g of groups) {
    if (isAbsent) {
      if (!isClassDayFor(g, dow, date)) continue; // dars kuni bo'lmasa o'tkazib yuboramiz
      await setGroupTeacherAbsent(g._id, date, currentUser);
    } else {
      await setGroupTeacherPresent(g._id, date);
    }
  }
};

// Sana uchun barcha faol o'qituvchilar + holati (yozuv bo'lmasa default "keldi")
export const listForDate = async (dateInput) => {
  // Mahalliy (Asia/Tashkent) kalendar kuni - UTC bilan kun siljimasin (A-2 parity)
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dateKey = dateKeyOf(date);

  const teachers = await User.find({ role: ROLES.TEACHER, isActive: true })
    .select(TEACHER_PROJECTION)
    .sort({ firstName: 1, lastName: 1 });
  const records = await TeacherAttendance.find({ dateKey });
  const map = new Map(records.map((r) => [String(r.teacher), r]));

  const rows = teachers.map((t) => {
    const r = map.get(String(t._id));
    return {
      teacher: { _id: t._id, firstName: t.firstName, lastName: t.lastName },
      status: r?.status || "present",
      reason: r?.reason || "",
    };
  });
  return { date, dateKey, rows };
};

// Bulk saqlash. "present" - yozuv o'chiriladi (default holatga qaytadi),
// "absent"/"excused" - upsert qilinadi.
export const bulkRecord = async (dateInput, items, currentUser) => {
  // Mahalliy (Asia/Tashkent) kalendar kuni - yozuv kalitlari student davomati
  // bilan bir xil bo'lishi shart (A-2 parity)
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dateKey = dateKeyOf(date);
  // Kelajak kun uchun davomat belgilanmaydi (o'tmishni tuzatish mumkin).
  // "Bugun" - mahalliy (Asia/Tashkent) kun, student davomati bilan bir xil.
  if (dateKey > localTodayKey()) {
    throw new ApiError(400, "Kelajak kun uchun davomat belgilab bo'lmaydi");
  }
  if (!Array.isArray(items) || !items.length) {
    throw new ApiError(400, "Hech bo'lmaganda bitta yozuv kerak");
  }

  // Har bir teacherId haqiqiy o'qituvchi ekanini tekshiramiz - ixtiyoriy
  // ObjectId (o'quvchi, yo'q user) uchun davomat yozuvi yaratilmasin.
  const teacherIds = [...new Set(items.map((i) => String(i.teacherId)))];
  const validTeachers = await User.find(
    { _id: { $in: teacherIds }, role: ROLES.TEACHER },
    { _id: 1 },
  );
  if (validTeachers.length !== teacherIds.length) {
    throw new ApiError(400, "Bir yoki bir nechta o'qituvchi noto'g'ri");
  }

  let marked = 0;
  let present = 0;
  for (const it of items) {
    if (!TEACHER_ATTENDANCE_STATUSES.includes(it.status)) continue;
    if (it.status === "present") {
      await TeacherAttendance.deleteOne({ teacher: it.teacherId, dateKey });
      // Keldi → barcha guruhlardagi "kelmadi" belgilarini olib tashlaymiz
      await syncTeacherGroupAbsences(it.teacherId, date, false, currentUser);
      present += 1;
    } else {
      await TeacherAttendance.findOneAndUpdate(
        { teacher: it.teacherId, dateKey },
        {
          teacher: it.teacherId,
          date,
          dateKey,
          status: it.status,
          reason: it.reason || "",
          recordedBy: currentUser?._id || null,
          recordedAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      // Kelmadi/sababli → o'qituvchining dars kuni bo'lgan barcha guruhlari "kelmadi"
      await syncTeacherGroupAbsences(it.teacherId, date, true, currentUser);
      marked += 1;
    }
  }
  return { dateKey, marked, present, total: items.length };
};
