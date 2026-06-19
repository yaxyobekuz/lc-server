import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const membershipRemove = asyncHandler(async (req, res) => {
  const data = await groupsService.removeMembershipById(
    req.params.id,
    req.params.membershipId,
  );
  res.json({ success: true, data, message: "O'qish davri o'chirildi" });
});

export default membershipRemove;
