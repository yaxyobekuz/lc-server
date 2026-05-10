import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const cancel = asyncHandler(async (req, res) => {
  const data = await service.cancel(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Oylik bekor qilindi" });
});

export default cancel;
