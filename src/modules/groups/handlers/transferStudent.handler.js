import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const transferStudent = asyncHandler(async (req, res) => {
  const data = await groupsService.transferStudent(
    req.params.id,
    req.params.studentId,
    req.body.targetGroupId,
    { joinedAt: req.body.joinedAt },
  );
  res.json({
    success: true,
    data,
    message: "O'quvchi boshqa guruhga ko'chirildi",
  });
});

export default transferStudent;
