import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import ApiError from "../../../utils/ApiError.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as teacherSalaryService from "./teacherSalary.service.js";

// O'qituvchiga maosh to'lovi (chiqim), so'ng maosh statusini yangilaydi.
export const create = async ({ salaryId, amount, method, paidAt, note }, currentUser) => {
  const salary = await TeacherSalary.findById(salaryId);
  if (!salary) throw new ApiError(404, "Maosh topilmadi");

  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");

  const trx = await SalaryTransaction.create({
    salary: salary._id,
    teacher: salary.teacher,
    group: salary.group,
    year: salary.year,
    month: salary.month,
    amount,
    method,
    paidAt: day,
    note: note || "",
    createdBy: currentUser?._id || null,
  });

  await teacherSalaryService.recalcStatus(salary._id);
  return trx;
};

// To'lovni bekor qiladi (soft-delete), statusni qayta hisoblaydi.
export const remove = async (id, currentUser) => {
  const trx = await SalaryTransaction.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!trx) throw new ApiError(404, "Tranzaksiya topilmadi");
  await trx.softDelete(currentUser?._id);
  await teacherSalaryService.recalcStatus(trx.salary);
  return { _id: id };
};
