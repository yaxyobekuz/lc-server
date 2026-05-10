import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const recordContact = asyncHandler(async (req, res) => {
  const data = await service.recordContact(
    req.params.id,
    req.body.message,
    req.user,
  );
  res.status(201).json({ success: true, data, message: "Bog'lanish qayd qilindi" });
});

export default recordContact;
