import asyncHandler from "../../../middleware/asyncHandler.js";
import * as reportService from "../services/report.service.js";

const regenerate = asyncHandler(async (req, res) => {
  const data = await reportService.regenerate(req.body.year, req.body.month);
  res.json({ success: true, data, message: "Generatsiya yakunlandi" });
});

export default regenerate;
