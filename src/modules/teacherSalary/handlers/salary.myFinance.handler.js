import asyncHandler from "../../../middleware/asyncHandler.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import * as teacherSalaryService from "../services/teacherSalary.service.js";

// Logindagi o'qituvchining O'Z moliya ma'lumotini qaytaradi (oylik, bonus,
// jarima, to'lovlar tarixi). Faqat teacher rolida - boshqa o'qituvchi ID'sini
// olib bo'lmaydi, doimo req.user._id.
const myFinance = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.TEACHER) {
    throw new ApiError(403, "Faqat o'qituvchilar uchun");
  }
  const data = await teacherSalaryService.myFinance(req.user._id);
  res.json({ success: true, data });
});

export default myFinance;
