import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryConfigService from "../services/salaryConfig.service.js";

const upsert = asyncHandler(async (req, res) => {
  const data = await salaryConfigService.upsert(req.body, req.user);
  res.json({ success: true, data, message: "Maosh sozlamasi saqlandi" });
});

export default upsert;
