import asyncHandler from "../../../middleware/asyncHandler.js";
import * as studentPaymentService from "../services/studentPayment.service.js";

const historyByStudent = asyncHandler(async (req, res) => {
  const data = await studentPaymentService.historyByStudent(
    req.params.studentId,
  );
  res.json({ success: true, data });
});

export default historyByStudent;
