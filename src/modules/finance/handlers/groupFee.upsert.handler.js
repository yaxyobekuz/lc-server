import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupFeeService from "../services/groupFee.service.js";

const upsert = asyncHandler(async (req, res) => {
  const data = await groupFeeService.upsert(req.body, req.user);
  res.json({ success: true, data, message: "Guruh to'lovi saqlandi" });
});

export default upsert;
