import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/invoices.service.js";

const cancel = asyncHandler(async (req, res) => {
  const data = await service.cancel(
    req.params.id,
    { reason: req.body?.reason },
    req.user,
  );
  res.json({ success: true, data, message: "Hisob bekor qilindi" });
});

export default cancel;
