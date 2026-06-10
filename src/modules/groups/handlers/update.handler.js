import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await groupsService.update(req.params.id, req.body);
  let message = "Saqlandi";
  const pc = data?.priceChange;
  if (pc && pc.repriced > 0) {
    message = `Saqlandi - joriy oy uchun ${pc.repriced} ta hisob yangi narxga moslandi`;
  }
  res.json({ success: true, data, message });
});

export default update;
