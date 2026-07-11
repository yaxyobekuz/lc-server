import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/holidays.service.js";

const congratulate = asyncHandler(async (req, res) => {
  const data = await service.congratulateTeacher(
    req.params.id,
    req.body,
    req.user,
  );
  res.status(201).json({ success: true, data, message: "Tabrik yuborildi" });
});

export default congratulate;
