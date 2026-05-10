import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenses.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Xarajat qo'shildi" });
});

export default create;
