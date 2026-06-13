import asyncHandler from "../../../middleware/asyncHandler.js";
import * as refundService from "../services/refund.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await refundService.create(req.body, req.user);
  res
    .status(201)
    .json({ success: true, data, message: "Pul o'quvchiga qaytarib berildi" });
});

export default create;
