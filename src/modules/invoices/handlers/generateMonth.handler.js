import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/invoices.service.js";

const generateMonth = asyncHandler(async (req, res) => {
  const result = await service.generateForPeriod(
    { year: req.body.year, month: req.body.month },
    { createdBy: req.user?._id },
  );
  res.json({
    success: true,
    data: result,
    message: `Yaratildi: ${result.created}, mavjud: ${result.skipped}`,
  });
});

export default generateMonth;
