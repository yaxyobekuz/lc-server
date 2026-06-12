import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const addStudent = asyncHandler(async (req, res) => {
  const data = await groupsService.addStudent(req.params.id, req.body.studentId, {
    joinedAt: req.body.joinedAt,
    leftAt: req.body.leftAt,
  });
  res.status(201).json({
    success: true,
    data,
    message: "O'quvchi qo'shildi",
  });
});

export default addStudent;
