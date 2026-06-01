import TeacherAttendance, {
  TEACHER_ATTENDANCE_STATUSES,
} from "../../../models/teacherAttendance.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { dateKeyOf } from "../../../helpers/attendance.helper.js";

const TEACHER_PROJECTION = { firstName: 1, lastName: 1, username: 1 };

// Sana uchun barcha faol o'qituvchilar + holati (yozuv bo'lmasa default "keldi")
export const listForDate = async (dateInput) => {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "Sana noto'g'ri");
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
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "Sana noto'g'ri");
  const dateKey = dateKeyOf(date);
  // Kelajak kun uchun davomat belgilanmaydi (o'tmishni tuzatish mumkin)
  if (dateKey > dateKeyOf(new Date())) {
    throw new ApiError(400, "Kelajak kun uchun davomat belgilab bo'lmaydi");
  }
  if (!Array.isArray(items) || !items.length) {
    throw new ApiError(400, "Hech bo'lmaganda bitta yozuv kerak");
  }

  let marked = 0;
  let present = 0;
  for (const it of items) {
    if (!TEACHER_ATTENDANCE_STATUSES.includes(it.status)) continue;
    if (it.status === "present") {
      await TeacherAttendance.deleteOne({ teacher: it.teacherId, dateKey });
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
      marked += 1;
    }
  }
  return { dateKey, marked, present, total: items.length };
};
