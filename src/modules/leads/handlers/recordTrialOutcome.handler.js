import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const recordTrialOutcome = asyncHandler(async (req, res) => {
  const data = await service.recordTrialOutcome(
    req.params.id,
    req.body.outcome,
    req.user,
  );
  res.json({
    success: true,
    data,
    message:
      req.body.outcome === "attended"
        ? "Sinovga keldi deb belgilandi"
        : "Sinovga kelmadi deb belgilandi",
  });
});

export default recordTrialOutcome;
