import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const membershipList = asyncHandler(async (req, res) => {
  const data = await groupsService.listMemberships(
    req.params.id,
    req.params.studentId,
  );
  res.json({ success: true, data });
});

export default membershipList;
