import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/teacherAbsence.service.js";

const teacherAttendanceSet = asyncHandler(async (req, res) => {
  const present = !!req.body.present;
  const data = await service.toggle(
    req.params.groupId,
    req.body.date,
    present,
    req.user,
  );
  res.json({
    success: true,
    data,
    message: present
      ? "O'qituvchi keldi deb belgilandi"
      : "O'qituvchi kelmadi deb belgilandi",
  });
});

export default teacherAttendanceSet;
