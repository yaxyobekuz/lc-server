import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/feedback.service.js";

const submit = asyncHandler(async (req, res) => {
  const data = await service.submit(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Feedback yuborildi" });
});

export default submit;
