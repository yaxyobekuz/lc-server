import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryConfigService from "../services/salaryConfig.service.js";

const list = asyncHandler(async (req, res) => {
  const data = await salaryConfigService.list(req.query);
  res.json({ success: true, data });
});

export default list;
