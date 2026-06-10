import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { localTodayMidnight } from "../../../helpers/attendance.helper.js";
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

  // Yangi o'qituvchi uchun joriy oy maoshini yaratamiz (best-effort).
  // Oy o'rtasida almashtirilsa, body.date proratsiya uchun workStartDate bo'ladi.
  try {
    const today = localTodayMidnight();
    await teacherSalaryService.ensureSalaryForTeacherGroup(
      newId,
      group._id,
      today.getUTCFullYear(),
      today.getUTCMonth() + 1,
      { workStartDate: body.date || null },
    );
  } catch (err) {
    logger.warn({ err }, "Almashtirilgan o'qituvchi uchun maosh yaratilmadi");
  }

  return getById(group._id);
};
