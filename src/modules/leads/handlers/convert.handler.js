import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const convert = asyncHandler(async (req, res) => {
  const data = await service.convert(req.params.id, req.body, req.user);
  res
    .status(201)
    .json({ success: true, data, message: "Lid o'quvchiga aylantirildi" });
});

export default convert;
