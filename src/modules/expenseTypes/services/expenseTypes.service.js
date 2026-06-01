import ExpenseType, {
  DEFAULT_EXPENSE_TYPES,
} from "../../../models/expenseType.model.js";
import ApiError from "../../../utils/ApiError.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Birinchi marta — standart turlarni avtomatik yaratamiz (dropdown bo'sh qolmasin)
const ensureDefaults = async () => {
  const count = await ExpenseType.estimatedDocumentCount();
  if (count > 0) return;
  for (const name of DEFAULT_EXPENSE_TYPES) {
    await ExpenseType.findOneAndUpdate(
      { name, isActive: true },
      { $setOnInsert: { name, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
};

export const list = async ({
  search,
  includeInactive = false,
  page = 1,
  limit = 50,
}) => {
  await ensureDefaults();
  const filter = {};
  if (!includeInactive) filter.isActive = true;
  if (search && search.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ExpenseType.find(filter)
      .sort({ isDefault: -1, name: 1 })
      .skip(skip)
      .limit(limit),
    ExpenseType.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await ExpenseType.findById(id);
  if (!doc) throw new ApiError(404, "Xarajat turi topilmadi");
  return doc;
};

export const create = async ({ name }) => {
  const trimmed = String(name).trim();
  const exists = await ExpenseType.findOne({ name: trimmed, isActive: true });
  if (exists) throw new ApiError(409, "Bunday xarajat turi mavjud");
  return ExpenseType.create({ name: trimmed });
};

export const update = async (id, body) => {
  const doc = await getById(id);
  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
    if (trimmed !== doc.name) {
      const conflict = await ExpenseType.findOne({
        _id: { $ne: doc._id },
        name: trimmed,
        isActive: true,
      });
      if (conflict) throw new ApiError(409, "Bunday xarajat turi mavjud");
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

export const setDefault = async (id) => {
  const doc = await ExpenseType.setDefault(id);
  if (!doc) throw new ApiError(404, "Xarajat turi topilmadi");
  return doc;
};
