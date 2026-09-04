import asyncHandler from "../../../middleware/asyncHandler.js";
import * as debtService from "../services/debt.service.js";

const writeOff = asyncHandler(async (req, res) => {
  const data = await debtService.writeOff(
    req.params.studentId,
    { reason: req.body?.reason },
    req.user,
  );
  res.json({
    success: true,
    data,
    // Depozit qarzni to'liq yopgan bo'lsa hech nima hisobdan chiqarilmaydi -
    // owner "chiqarildi" degan yolg'on xabarni ko'rmasligi kerak.
    message: data.months
      ? "Qarz hisobdan chiqarildi"
      : "Qarz depozitdan to'liq qoplandi - hisobdan chiqarishga hojat qolmadi",
  });
});

export default writeOff;
