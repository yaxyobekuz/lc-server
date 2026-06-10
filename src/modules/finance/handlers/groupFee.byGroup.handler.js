import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupFeeService from "../services/groupFee.service.js";

const byGroup = asyncHandler(async (req, res) => {
  const data = await groupFeeService.byGroup(req.params.groupId);
  res.json({ success: true, data });
});

export default byGroup;
