import PaymentMethod from "../../../models/paymentMethod.model.js";
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
    PaymentMethod.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    PaymentMethod.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await PaymentMethod.findById(id);
  if (!doc) throw new ApiError(404, "To'lov usuli topilmadi");
  return doc;
};

export const create = async ({ name, code }) => {
  const trimmedName = String(name).trim();
  const trimmedCode = code ? String(code).trim().toLowerCase() : "";

  const conflicts = [{ name: trimmedName, isActive: true }];
  if (trimmedCode) conflicts.push({ code: trimmedCode, isActive: true });
  const exists = await PaymentMethod.findOne({ $or: conflicts });
  if (exists) throw new ApiError(409, "Bunday to'lov usuli mavjud");

  return PaymentMethod.create({ name: trimmedName, code: trimmedCode });
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
    if (trimmed !== doc.name) {
      const conflict = await PaymentMethod.findOne({
        _id: { $ne: doc._id },
        name: trimmed,
        isActive: true,
      });
      if (conflict) throw new ApiError(409, "Bunday to'lov usuli mavjud");
    }
    doc.name = trimmed;
  }
  if (body.code !== undefined) {
    const trimmed = String(body.code).trim().toLowerCase();
    if (trimmed && trimmed !== doc.code) {
      const conflict = await PaymentMethod.findOne({
        _id: { $ne: doc._id },
        code: trimmed,
        isActive: true,
      });
      if (conflict) throw new ApiError(409, "Bunday kod mavjud");
    }
    doc.code = trimmed;
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
