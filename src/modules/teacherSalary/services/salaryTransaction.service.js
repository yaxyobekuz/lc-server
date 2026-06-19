import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { assertGroupActive } from "../../../helpers/group.helper.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as teacherSalaryService from "./teacherSalary.service.js";

// O'qituvchiga maosh to'lovi (chiqim). Qoldiqdan (expected - paid) ORTIQ to'lashga
// yo'l qo'yilmaydi - cheklov shartli-atomik update bilan tekshiriladi, shuning
// uchun parallel double-click ham capdan o'tib keta olmaydi (C3).
export const create = async ({ salaryId, amount, method, paidAt, note }, currentUser) => {
  const salary = await TeacherSalary.findById(salaryId);
  if (!salary) throw new ApiError(404, "Maosh topilmadi");

  // Arxivlangan guruh maoshiga to'lov yozilmaydi (avval arxivdan chiqarish kerak).
  assertGroupActive(
    await Group.findById(salary.group, { isActive: 1, isDeleted: 1 }),
  );

  const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
  if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");
  // Kelajak sanaga chiqim yozib bo'lmaydi (kassa kunlik hisobi buzilmasin)
  if (day.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "To'lov sanasi kelajakda bo'lishi mumkin emas");
  }

  // Avval balans atomik oshiriladi (cap sharti bilan), keyin tranzaksiya yoziladi.
  const updated = await teacherSalaryService.applyPaidDelta(salary._id, amount, {
    capToRemaining: true,
  });
  if (!updated) {
    const remaining = Math.max(0, (salary.expectedAmount || 0) - (salary.paidAmount || 0));
    throw new ApiError(
      400,
      `To'lov qoldiqdan oshib ketadi (qoldiq: ${remaining} so'm)`,
    );
  }

  try {
    return await SalaryTransaction.create({
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
  } catch (err) {
    // Tranzaksiya yozilmasa - balans oshirilgancha qolmasin (rollback)
    await teacherSalaryService.applyPaidDelta(salary._id, -amount);
    throw err;
  }
};

// To'lovni bekor qiladi (soft-delete), balansni atomik kamaytiradi.
export const remove = async (id, currentUser) => {
  const trx = await SalaryTransaction.findOne({ _id: id, isDeleted: { $ne: true } });
  if (!trx) throw new ApiError(404, "Tranzaksiya topilmadi");
  await trx.softDelete(currentUser?._id);
  await teacherSalaryService.applyPaidDelta(trx.salary, -trx.amount);
  return { _id: id };
};
