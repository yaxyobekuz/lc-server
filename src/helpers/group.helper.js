import ApiError from "../utils/ApiError.js";
import { toUtcMidnight, localTodayMidnight } from "./attendance.helper.js";

// Tugagan (yoki o'chirilgan) kursda yozuv amalini bloklaydi. Mavjud yuklangan guruh
// hujjatidan tekshiradi - ortiqcha so'rovsiz. Read yo'llarida CHAQIRILMAYDI.
// isActive endDate'dan derived kesh; xavfsizlik uchun endDate o'tganini ham
// tekshiramiz (kunlik job isActive'ni yangilagunча bo'lgan oyna).
export const assertGroupActive = (group) => {
  if (!group || group.isDeleted) throw new ApiError(404, "Guruh topilmadi");
  const ended =
    group.endDate &&
    toUtcMidnight(group.endDate).getTime() <= localTodayMidnight().getTime();
  if (!group.isActive || ended) {
    throw new ApiError(
      400,
      "Kurs tugagan. Davom ettirish uchun tugash sanasini o'zgartiring.",
    );
  }
  return group;
};
