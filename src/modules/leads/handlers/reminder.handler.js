import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const reminder = asyncHandler(async (req, res) => {
  const data = await service.setReminder(req.params.id, {
    followUpAt: req.body.followUpAt,
    followUpNote: req.body.followUpNote,
  });
  const message = data.followUpAt ? "Eslatma o'rnatildi" : "Eslatma o'chirildi";
  res.json({ success: true, data, message });
});

export default reminder;
