import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const updateMembership = asyncHandler(async (req, res) => {
  const data = await groupsService.updateMembership(
    req.params.id,
    req.params.studentId,
    {
      joinedAt: req.body.joinedAt,
      leftAt: req.body.leftAt,
    },
  );
  res.status(200).json({
    success: true,
    data,
    message: "A'zolik sanalari yangilandi",
  });
});

export default updateMembership;
