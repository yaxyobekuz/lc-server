import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseTypes.service.js";

const setDefault = asyncHandler(async (req, res) => {
  const data = await service.setDefault(req.params.id);
  res.json({ success: true, data, message: "Asosiy qilib belgilandi" });
});

export default setDefault;
