import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { localTodayMidnight, toUtcMidnight } from "../../../helpers/attendance.helper.js";
import { getById } from "./groups.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Noto'g'ri identifikator");
  }
  return new mongoose.Types.ObjectId(String(id));
};

// O'qituvchini boshqasiga almashtirish - group.teachers yangilanadi.
export const replaceTeacher = async (groupId, body) => {
  const group = await Group.findById(groupId);
  if (!group || !group.isActive) throw new ApiError(404, "Guruh topilmadi");

  const oldId = toObjectId(body.oldTeacherId);
  const newId = toObjectId(body.newTeacherId);
  if (String(oldId) === String(newId)) {
    throw new ApiError(400, "Bir xil o'qituvchini almashtirib bo'lmaydi");
  }

  const inGroup = (group.teachers || []).some(
    (t) => String(t) === String(oldId),
  );
  if (!inGroup) throw new ApiError(400, "Eski o'qituvchi bu guruhda emas");

  const alreadyIn = (group.teachers || []).some(
    (t) => String(t) === String(newId),
  );
  if (alreadyIn) throw new ApiError(400, "Yangi o'qituvchi allaqachon bu guruhda");

  const newTeacher = await User.findById(newId);
  if (!newTeacher || newTeacher.role !== ROLES.TEACHER || !newTeacher.isActive) {
    throw new ApiError(400, "Yangi o'qituvchi noto'g'ri");
  }

  // group.teachers - eskini yangisiga almashtiramiz
  group.teachers = (group.teachers || []).map((t) =>
    String(t) === String(oldId) ? newId : t,
  );
  await group.save();

  // Almashtirish sanasi (oy o'rtasi proratsiyasi uchun): body.date yoki bugun.
  const changeDate = body.date ? toUtcMidnight(body.date) : localTodayMidnight();
  const year = changeDate.getUTCFullYear();
  const month = changeDate.getUTCMonth() + 1;

  // Eski o'qituvchining OXIRGI ish kuni - almashtirish kunidan bir kun oldin.
  // workEndDate proratsiyada inclusive, yangi o'qituvchi esa changeDate'dan
  // boshlaydi - ikkalasiga ham changeDate'ni berish o'sha kunni IKKI MARTA
  // to'lardi (M4). changeDate oy 1-kuni bo'lsa, oxirgi kun o'tgan oyga tushadi
  // va joriy oy maoshi 0 ga proratsiya bo'ladi - bu to'g'ri.
  const lastWorkDay = new Date(changeDate.getTime() - 24 * 60 * 60 * 1000);
  try {
    await teacherSalaryService.markTeacherLeft(oldId, group._id, year, month, lastWorkDay);
  } catch (err) {
    logger.warn({ err }, "Eski o'qituvchi maoshi proratsiya qilinmadi");
  }

  // Yangi o'qituvchi uchun joriy oy maoshini yaratamiz (best-effort).
  // Oy o'rtasida almashtirilsa, changeDate proratsiya uchun workStartDate bo'ladi.
  try {
    await teacherSalaryService.ensureSalaryForTeacherGroup(newId, group._id, year, month, {
      workStartDate: changeDate,
    });
  } catch (err) {
    logger.warn({ err }, "Almashtirilgan o'qituvchi uchun maosh yaratilmadi");
  }

  return getById(group._id);
};
