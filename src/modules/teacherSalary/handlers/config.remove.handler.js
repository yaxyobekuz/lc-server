import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryConfigService from "../services/salaryConfig.service.js";

const remove = asyncHandler(async (req, res) => {
  const { teacher, group } = req.params;
  const data = await salaryConfigService.remove(teacher, group);
  res.json({ success: true, data, message: "Maosh sozlamasi o'chirildi" });
});

export default remove;
