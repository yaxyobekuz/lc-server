import asyncHandler from "../../../middleware/asyncHandler.js";
import { replaceTeacher as replaceTeacherService } from "../services/replaceTeacher.service.js";

const replaceTeacher = asyncHandler(async (req, res) => {
  const data = await replaceTeacherService(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "O'qituvchi almashtirildi" });
});

export default replaceTeacher;
