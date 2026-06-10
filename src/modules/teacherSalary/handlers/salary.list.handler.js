import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildMeta } from "../../../utils/pagination.js";
import * as teacherSalaryService from "../services/teacherSalary.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await teacherSalaryService.list(req.query);
  res.json({ success: true, data: items, meta: buildMeta({ page, limit, total }) });
});

export default list;
