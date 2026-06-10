import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupFeeService from "../services/groupFee.service.js";

const list = asyncHandler(async (req, res) => {
  const data = await groupFeeService.list(req.query);
  res.json({ success: true, data });
});

export default list;
