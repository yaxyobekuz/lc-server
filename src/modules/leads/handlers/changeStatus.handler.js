import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const changeStatus = asyncHandler(async (req, res) => {
  const data = await service.changeStatus(
    req.params.id,
    req.body.statusId,
    req.body.message,
    req.user,
  );
  res.json({ success: true, data, message: "Status o'zgartirildi" });
});

export default changeStatus;
