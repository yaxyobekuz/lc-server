import asyncHandler from "../../../middleware/asyncHandler.js";
import { restorePayment } from "../../../helpers/cascadeDelete.helper.js";

const undelete = asyncHandler(async (req, res) => {
  await restorePayment(req.params.id);
  res.json({ success: true, message: "To'lov qaytarildi" });
});

export default undelete;
