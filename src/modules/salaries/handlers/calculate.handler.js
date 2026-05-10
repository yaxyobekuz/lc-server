import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/salaries.service.js";

const calculate = asyncHandler(async (req, res) => {
  const { year, month, teacherId } = req.body;
  if (teacherId) {
    const data = await service.calculateForTeacher(
      teacherId,
      { year, month },
      req.user,
    );
    return res.status(201).json({
      success: true,
      data,
      message: "Oylik hisoblandi",
    });
  }
  const data = await service.calculateForAll({ year, month }, req.user);
  res.status(201).json({
    success: true,
    data,
    message: "Oyliklar hisoblandi",
  });
});

export default calculate;
