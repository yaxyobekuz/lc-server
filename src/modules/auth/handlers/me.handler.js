import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/auth.service.js";

const me = asyncHandler(async (req, res) => {
  const data = await service.me(req.user);
  res.json({ success: true, data });
});

export default me;
