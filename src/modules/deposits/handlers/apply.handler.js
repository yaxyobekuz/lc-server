import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const apply = asyncHandler(async (req, res) => {
  // Qo'lda bosilgan tugma - ATAYLAB qilingan amal: avto-qoplash to'xtatilgan
  // bo'lsa ham bajariladi va to'xtatish bayrog'i yechiladi.
  const data = await depositService.autoApply(req.body.studentId, req.user, {
    force: true,
  });
  res.json({ success: true, data, message: "Depozitdan qoplandi" });
});

export default apply;
