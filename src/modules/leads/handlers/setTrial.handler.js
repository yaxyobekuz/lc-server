import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const setTrial = asyncHandler(async (req, res) => {
  const data = await service.setTrial(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Sinov darsi sozlandi" });
});

export default setTrial;
