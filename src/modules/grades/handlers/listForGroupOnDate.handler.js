import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/grades.service.js";

const listForGroupOnDate = asyncHandler(async (req, res) => {
  const data = await service.listForGroupOnDate(
    req.params.groupId,
    req.query.date,
    req.query.slot ?? null,
  );
  res.json({ success: true, data });
});

export default listForGroupOnDate;
