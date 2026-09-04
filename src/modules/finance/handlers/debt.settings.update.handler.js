import asyncHandler from "../../../middleware/asyncHandler.js";
import * as debtService from "../services/debt.service.js";

const settingsUpdate = asyncHandler(async (req, res) => {
  const data = await debtService.updateSettings(req.body);
  res.json({ success: true, data, message: "Sozlamalar saqlandi" });
});

export default settingsUpdate;
