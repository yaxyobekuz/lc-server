import Holiday, { HOLIDAY_AUDIENCES } from "../../../models/holiday.model.js";
import ApiError from "../../../utils/ApiError.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const list = async ({
  search,
  audience,
  includeInactive = false,
  includePast = false,
  page = 1,
  limit = 100,
}) => {
  const filter = {};
  if (!includeInactive) filter.isActive = true;
  if (audience) filter.audience = audience;
  if (search && search.trim()) {
    filter.name = { $regex: escapeRegex(search.trim()), $options: "i" };
  }
  if (!includePast) {
    // One-time bayramlardan o'tganlarini chiqarib tashlash
    const currentYear = new Date().getUTCFullYear();
    filter.$or = [
      { isRecurring: true },
      { isRecurring: false, year: { $gte: currentYear } },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Holiday.find(filter)
      .sort({ month: 1, day: 1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", { firstName: 1, lastName: 1 }),
    Holiday.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await Holiday.findById(id).populate("createdBy", {
    firstName: 1,
    lastName: 1,
  });
  if (!doc) throw new ApiError(404, "Bayram topilmadi");
  return doc;
};

const validateBody = (body) => {
  if (body.audience && !HOLIDAY_AUDIENCES.includes(body.audience)) {
    throw new ApiError(400, "Noto'g'ri auditoriya");
  }
  if (body.month !== undefined) {
    const m = Number(body.month);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new ApiError(400, "Oy 1 dan 12 gacha bo'lishi kerak");
    }
  }
  if (body.day !== undefined) {
    const d = Number(body.day);
    if (!Number.isInteger(d) || d < 1 || d > 31) {
      throw new ApiError(400, "Kun 1 dan 31 gacha bo'lishi kerak");
    }
  }
};

export const create = async (body, currentUser) => {
  validateBody(body);
  const trimmed = String(body.name || "").trim();
  if (!trimmed) throw new ApiError(400, "Nom kerak");

  const isRecurring = body.isRecurring !== false;
  const year = isRecurring ? null : Number(body.year);
  if (!isRecurring && (!year || year < 2000 || year > 2100)) {
    throw new ApiError(400, "Bir martalik bayram uchun to'g'ri yil kerak");
  }

  return Holiday.create({
    name: trimmed,
    isRecurring,
    month: Number(body.month),
    day: Number(body.day),
    year,
    message: String(body.message),
    audience: body.audience || "all",
    createdBy: currentUser?._id || null,
  });
};

export const update = async (id, body) => {
  const doc = await getById(id);
  validateBody(body);

  if (body.name !== undefined) doc.name = String(body.name).trim();
  if (body.message !== undefined) doc.message = String(body.message);
  if (body.audience !== undefined) doc.audience = body.audience;
  if (body.month !== undefined) doc.month = Number(body.month);
  if (body.day !== undefined) doc.day = Number(body.day);
  if (body.isActive !== undefined) doc.isActive = !!body.isActive;

  if (body.isRecurring !== undefined) {
    doc.isRecurring = !!body.isRecurring;
  }
  if (doc.isRecurring) {
    doc.year = null;
  } else if (body.year !== undefined) {
    const y = Number(body.year);
    if (!y || y < 2000 || y > 2100) {
      throw new ApiError(400, "Yil 2000-2100 oralig'ida bo'lishi kerak");
    }
    doc.year = y;
  }

  await doc.save();
  return doc;
};

export const softRemove = async (id) => {
  const doc = await getById(id);
  doc.isActive = false;
  await doc.save();
  return doc;
};

const sameUtcDay = (a, b) => {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
};

// Bugungi mos faol bayramlar (Agenda jobi uchun)
export const getTodayHolidays = async (now = new Date()) => {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();

  const all = await Holiday.find({
    isActive: true,
    month,
    day,
  });

  return all.filter((h) => h.isRecurring || h.year === year);
};

export const markSent = async (id, now = new Date()) => {
  await Holiday.updateOne({ _id: id }, { $set: { lastSentAt: now } });
};

export const isAlreadySentToday = (holiday, now = new Date()) =>
  sameUtcDay(holiday.lastSentAt, now);
