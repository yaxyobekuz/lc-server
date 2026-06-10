import LeadOption from "../../../models/leadOption.model.js";
import ApiError from "../../../utils/ApiError.js";
import { LEAD_OPTION_KINDS } from "../../../constants/leadStatus.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const list = async ({ kind, search, includeInactive = false }) => {
  const filter = {};
  if (kind) filter.kind = kind;
  if (!includeInactive) filter.isActive = true;
  if (search && search.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }
  const items = await LeadOption.find(filter).sort({ createdAt: -1 });
  return { items, total: items.length };
};

export const getById = async (id) => {
  const doc = await LeadOption.findById(id);
  if (!doc) throw new ApiError(404, "Sozlama topilmadi");
  return doc;
};

export const create = async (body, currentUser) => {
  if (!LEAD_OPTION_KINDS.includes(body.kind)) {
    throw new ApiError(400, "Noto'g'ri tur");
  }
  const name = String(body.name || "").trim();
  if (!name) throw new ApiError(400, "Nom kerak");
  return LeadOption.create({
    kind: body.kind,
    name,
    createdBy: currentUser?._id || null,
  });
};

export const update = async (id, body) => {
  const doc = await getById(id);
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw new ApiError(400, "Nom kerak");
    doc.name = name;
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
