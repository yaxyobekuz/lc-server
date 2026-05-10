import DiscountKind from "../../../models/discountKind.model.js";
import ApiError from "../../../utils/ApiError.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const list = async ({
  search,
  includeInactive = false,
  page = 1,
  limit = 50,
}) => {
  const filter = {};
  if (!includeInactive) filter.isActive = true;
  if (search && search.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    DiscountKind.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    DiscountKind.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await DiscountKind.findById(id);
  if (!doc) throw new ApiError(404, "Chegirma turi topilmadi");
  return doc;
};

export const create = async ({ name }) => {
  const trimmed = String(name).trim();
  const exists = await DiscountKind.findOne({ name: trimmed, isActive: true });
  if (exists) throw new ApiError(409, "Bunday chegirma turi mavjud");
  return DiscountKind.create({ name: trimmed });
};

export const update = async (id, body) => {
  const doc = await getById(id);
  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
    if (trimmed !== doc.name) {
      const conflict = await DiscountKind.findOne({
        _id: { $ne: doc._id },
        name: trimmed,
        isActive: true,
      });
      if (conflict) throw new ApiError(409, "Bunday chegirma turi mavjud");
    }
    doc.name = trimmed;
  }
  if (body.isActive !== undefined) doc.isActive = !!body.isActive;
  await doc.save();
  return doc;
};

export const softRemove = async (id) => {
  const doc = await getById(id);
  doc.isActive = false;
  await doc.save();
  return doc;
};
