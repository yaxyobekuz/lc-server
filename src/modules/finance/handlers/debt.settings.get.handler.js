import asyncHandler from "../../../middleware/asyncHandler.js";
import * as debtService from "../services/debt.service.js";

const settingsGet = asyncHandler(async (req, res) => {
  const data = await debtService.getSettings();
  res.json({ success: true, data });
});

export default settingsGet;
