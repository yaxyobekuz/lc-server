import asyncHandler from "../../../middleware/asyncHandler.js";
import { deletePayment } from "../../../helpers/cascadeDelete.helper.js";

// To'lovni o'chirish (soft) — hisobdan chiqadi, invoice paidAmount/status qayta hisoblanadi
const remove = asyncHandler(async (req, res) => {
  await deletePayment(req.params.id, req.user?._id);
  res.json({ success: true, message: "To'lov o'chirildi" });
});

export default remove;
