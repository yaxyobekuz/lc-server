import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const apply = asyncHandler(async (req, res) => {
  const data = await depositService.autoApply(req.body.studentId, req.user);
  res.json({ success: true, data, message: "Depozitdan qoplandi" });
});

export default apply;
