import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import TeacherGroupRate from "../../../models/teacherGroupRate.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { getById } from "./groups.service.js";

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Noto'g'ri identifikator");
  }
  return new mongoose.Types.ObjectId(String(id));
};

// O'qituvchini boshqasiga almashtirish:
//  - eski o'qituvchining faol stavkasi almashish sanasida yopiladi
//  - yangi o'qituvchiga shu sanadan stavka ochiladi
//  - group.teachers yangilanadi
//  - shu oy oyliklari (eski + yangi) qayta hisoblanadi (har biriga alohida)
export const replaceTeacher = async (groupId, body, currentUser) => {
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

  const changeDate = body.date ? new Date(body.date) : new Date();

  // 1) Eski o'qituvchining faol stavkasini yopamiz (effectiveTo)
  const oldRate = await TeacherGroupRate.findOne({
    teacher: oldId,
    group: group._id,
    isActive: true,
  });
  if (oldRate) {
    oldRate.effectiveTo = changeDate;
    oldRate.isActive = false;
    await oldRate.save();
  }

  // 2) Yangi o'qituvchiga stavka ochamiz (almashish sanasidan)
  const r = body.rate || {};
  try {
    await TeacherGroupRate.create({
      teacher: newId,
      group: group._id,
      calculationType: r.calculationType,
      fixedAmount: Number(r.fixedAmount || 0),
      hourlyRate: Number(r.hourlyRate || 0),
      hoursPerSession:
        r.hoursPerSession !== undefined ? Number(r.hoursPerSession) : 2,
      percentageRate: Number(r.percentageRate || 0),
      amountPerStudent: Number(r.amountPerStudent || 0),
      minMonthlyAmount: Number(r.minMonthlyAmount || 0),
      effectiveFrom: changeDate,
      isActive: true,
      createdBy: currentUser?._id || null,
    });
  } catch (err) {
    // rollback: eski stavkani qayta faollashtiramiz
    if (oldRate) {
      oldRate.effectiveTo = null;
      oldRate.isActive = true;
      await oldRate.save();
    }
    throw err;
  }

  // 3) group.teachers — eskini yangisiga almashtiramiz
  group.teachers = (group.teachers || []).map((t) =>
    String(t) === String(oldId) ? newId : t,
  );
  await group.save();

  // 4) Shu oy oyliklarini qayta hisoblaymiz (best-effort, har biriga alohida)
  try {
    const { calculateForTeacher } = await import(
      "../../salaries/services/salaries.service.js"
    );
    const period = {
      year: changeDate.getUTCFullYear(),
      month: changeDate.getUTCMonth() + 1,
    };
    await calculateForTeacher(oldId, period, currentUser);
    await calculateForTeacher(newId, period, currentUser);
  } catch {
    /* oylik avtomatik yangilanmadi - keyin qo'lda hisoblash mumkin */
  }

  return getById(group._id);
};
