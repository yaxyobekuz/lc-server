import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const removeStudent = asyncHandler(async (req, res) => {
  await groupsService.removeStudent(req.params.id, req.params.studentId, {
    reasonId: req.body?.reasonId,
  });
  res.json({ success: true, message: "O'quvchi guruhdan chiqarildi" });
});

export default removeStudent;
