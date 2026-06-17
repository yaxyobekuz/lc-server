import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { localTodayMidnight, toUtcMidnight } from "../../../helpers/attendance.helper.js";
import { getById } from "./groups.service.js";
import * as teacherSalaryService from "../../teacherSalary/services/teacherSalary.service.js";
import * as teacherGroupPeriodService from "./teacherGroupPeriod.service.js";

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

  // Almashtirish sanasi (oy o'rtasi proratsiyasi uchun): body.date yoki bugun.
  const changeDate = body.date ? toUtcMidnight(body.date) : localTodayMidnight();
  const year = changeDate.getUTCFullYear();
  const month = changeDate.getUTCMonth() + 1;

  // Eski o'qituvchi davrini changeDate'da yopamiz (EXCLUSIVE → oxirgi ish kuni
  // changeDate'dan bir kun oldin), yangisini changeDate'dan boshlaymiz. Maosh
  // proratsiyasi davrlardan derived - o'sha kun ikki marta to'lanmaydi.
  // teachers[] keshi assign/unassign ichida sinxronlanadi.
  try {
    await teacherGroupPeriodService.unassignTeacher(group._id, oldId, { endDate: changeDate });
  } catch (err) {
    logger.warn({ err }, "Eski o'qituvchi davri yopilmadi");
  }
  try {
    await teacherGroupPeriodService.assignTeacher(group._id, newId, { startDate: changeDate });
    await teacherSalaryService.ensureSalaryForTeacherGroup(newId, group._id, year, month);
  } catch (err) {
    logger.warn({ err }, "Almashtirilgan o'qituvchi biriktirilmadi / maosh yaratilmadi");
  }

  return getById(group._id);
};
