import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const myCurrent = asyncHandler(async (req, res) => {
  const data = await service.getMyCurrentMonth(req.user._id);
  res.json({ success: true, data });
});

export default myCurrent;
