import LeadStatus from "../../../models/leadStatus.model.js";
import ApiError from "../../../utils/ApiError.js";

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const list = async ({
  search,
  includeInactive = false,
  page = 1,
  limit = 100,
}) => {
  const filter = {};
  if (!includeInactive) filter.isActive = true;
  if (search && search.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    LeadStatus.find(filter)
      .sort({ order: 1, createdAt: 1 })
      .skip(skip)
      .limit(limit),
    LeadStatus.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await LeadStatus.findById(id);
  if (!doc) throw new ApiError(404, "Lid statusi topilmadi");
  return doc;
};

const validatePayload = (body) => {
  if (body.color && !HEX_REGEX.test(body.color)) {
    throw new ApiError(400, "Rang HEX formatda bo'lishi kerak (#xxxxxx)");
  }
};

export const create = async (body) => {
  const trimmed = String(body.name || "").trim();
  if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
  validatePayload(body);

  const exists = await LeadStatus.findOne({ name: trimmed, isActive: true });
  if (exists) throw new ApiError(409, "Bunday lid statusi mavjud");

  const doc = {
    name: trimmed,
    color: body.color || "#6366f1",
    order: Number(body.order || 0),
    isInitial: !!body.isInitial,
    isFinal: !!body.isFinal,
    isConverted: !!body.isConverted,
  };
  return LeadStatus.create(doc);
};

// Yangilash natijasida invariant'lar buzilmasligini tekshiradi
const assertInvariants = async (excludeId = null) => {
  const filter = { isActive: true };
  if (excludeId) filter._id = { $ne: excludeId };

  // Hisob qilingandan keyingi holat - caller tomonidan ko'rsatilgan kombinatsiya
  // Bu yerda biz boshqa active record'larni sanaymiz, va caller flag'larini
  // alohida hisobga oladi (assertInvariantsAfter ichida yoki cycler tarafida).
  return LeadStatus.find(filter);
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed) throw new ApiError(400, "Nom bo'sh bo'lmasligi kerak");
    if (trimmed !== doc.name) {
      const conflict = await LeadStatus.findOne({
        _id: { $ne: doc._id },
        name: trimmed,
        isActive: true,
      });
      if (conflict) throw new ApiError(409, "Bunday lid statusi mavjud");
    }
    doc.name = trimmed;
  }

  validatePayload(body);
  if (body.color !== undefined) doc.color = body.color;
  if (body.order !== undefined) doc.order = Number(body.order);
  if (body.isInitial !== undefined) doc.isInitial = !!body.isInitial;
  if (body.isFinal !== undefined) doc.isFinal = !!body.isFinal;
  if (body.isConverted !== undefined) doc.isConverted = !!body.isConverted;
  if (body.isActive !== undefined) doc.isActive = !!body.isActive;

  // Invariantlar: kamida 1 ta isInitial=true, 1 ta isConverted=true (active)
  const others = await assertInvariants(doc._id);
  const willBeActive = doc.isActive;

  const initialCount =
    others.filter((d) => d.isInitial).length +
    (willBeActive && doc.isInitial ? 1 : 0);
  if (initialCount < 1) {
    throw new ApiError(
      400,
      "Kamida bitta 'Yangi' (isInitial=true) status bo'lishi kerak",
    );
  }
  const convertedCount =
    others.filter((d) => d.isConverted).length +
    (willBeActive && doc.isConverted ? 1 : 0);
  if (convertedCount < 1) {
    throw new ApiError(
      400,
      "Kamida bitta 'O'quvchiga aylangan' (isConverted=true) status bo'lishi kerak",
    );
  }

  await doc.save();
  return doc;
};

export const softRemove = async (id) => {
  const doc = await getById(id);
  if (!doc.isActive) return doc;

  // Invariantlarni saqlash
  const others = await LeadStatus.find({
    isActive: true,
    _id: { $ne: doc._id },
  });
  if (doc.isInitial && !others.some((d) => d.isInitial)) {
    throw new ApiError(
      400,
      "Bu yagona 'Yangi' (isInitial=true) status - o'chirib bo'lmaydi",
    );
  }
  if (doc.isConverted && !others.some((d) => d.isConverted)) {
    throw new ApiError(
      400,
      "Bu yagona 'O'quvchiga aylangan' (isConverted=true) status - o'chirib bo'lmaydi",
    );
  }

  doc.isActive = false;
  await doc.save();
  return doc;
};

export const findInitial = async () => {
  return LeadStatus.findOne({ isActive: true, isInitial: true }).sort({
    order: 1,
  });
};

export const findConvertedFlag = async () => {
  return LeadStatus.findOne({ isActive: true, isConverted: true }).sort({
    order: 1,
  });
};
