import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const membershipUpdate = asyncHandler(async (req, res) => {
  const data = await groupsService.updateMembershipById(
    req.params.id,
    req.params.membershipId,
    req.body,
  );
  res.json({ success: true, data, message: "O'qish davri yangilandi" });
});

export default membershipUpdate;
