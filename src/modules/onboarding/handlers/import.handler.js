import asyncHandler from "../../../middleware/asyncHandler.js";
import * as onboardingService from "../services/onboarding.service.js";

const importExisting = asyncHandler(async (req, res) => {
  const data = await onboardingService.importExisting(req.body, req.user);
  res.status(data.duplicate ? 200 : 201).json({
    success: true,
    data,
    message: data.duplicate
      ? "Bu import allaqachon bajarilgan"
      : "Tarixiy ma'lumot muvaffaqiyatli import qilindi",
  });
});

export default importExisting;
