import ApiError from "../utils/ApiError.js";

// Arxivlangan (yoki o'chirilgan) guruhda yozuv amalini bloklaydi. Mavjud yuklangan
// guruh hujjatidan tekshiradi - ortiqcha so'rovsiz. Read yo'llarida CHAQIRILMAYDI.
export const assertGroupActive = (group) => {
  if (!group || group.isDeleted) throw new ApiError(404, "Guruh topilmadi");
  if (!group.isActive) {
    throw new ApiError(400, "Guruh arxivlangan. Avval arxivdan chiqaring.");
  }
  return group;
};
