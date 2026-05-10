import NotificationTemplate, {
  TEMPLATE_CATEGORIES,
} from "../../../models/notificationTemplate.model.js";
import ApiError from "../../../utils/ApiError.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const list = async ({
  search,
  category,
  includeInactive = false,
  page = 1,
  limit = 50,
}) => {
  const filter = {};
  if (!includeInactive) filter.isActive = true;
  if (category) filter.category = category;
  if (search && search.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    NotificationTemplate.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    NotificationTemplate.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await NotificationTemplate.findById(id);
  if (!doc) throw new ApiError(404, "Shablon topilmadi");
  return doc;
};

const validateBody = (body) => {
  if (body.category && !TEMPLATE_CATEGORIES.includes(body.category)) {
    throw new ApiError(400, "Noto'g'ri kategoriya");
  }
};

export const create = async (body) => {
  validateBody(body);
  const trimmed = String(body.name || "").trim();
  if (!trimmed) throw new ApiError(400, "Nom kerak");

  const exists = await NotificationTemplate.findOne({
    name: trimmed,
    isActive: true,
  });
  if (exists) throw new ApiError(409, "Bunday shablon mavjud");

  return NotificationTemplate.create({
    name: trimmed,
    body: String(body.body),
    category: body.category || "custom",
  });
};

export const update = async (id, body) => {
  const doc = await getById(id);
  validateBody(body);

  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
    if (trimmed !== doc.name) {
      const conflict = await NotificationTemplate.findOne({
        _id: { $ne: doc._id },
        name: trimmed,
        isActive: true,
      });
      if (conflict) throw new ApiError(409, "Bunday shablon mavjud");
    }
    doc.name = trimmed;
  }
  if (body.body !== undefined) doc.body = String(body.body);
  if (body.category !== undefined) doc.category = body.category;
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
