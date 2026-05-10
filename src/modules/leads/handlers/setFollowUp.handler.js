import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const setFollowUp = asyncHandler(async (req, res) => {
  const data = await service.setFollowUp(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Eslatma sozlandi" });
});

export default setFollowUp;
