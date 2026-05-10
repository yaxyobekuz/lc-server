import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const addNote = asyncHandler(async (req, res) => {
  const data = await service.addNote(req.params.id, req.body.message, req.user);
  res.status(201).json({ success: true, data, message: "Eslatma qo'shildi" });
});

export default addNote;
