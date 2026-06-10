import Holiday, { HOLIDAY_AUDIENCES } from "../../../models/holiday.model.js";
import ApiError from "../../../utils/ApiError.js";
import { dateKeyOf, toUtcMidnight } from "../../../helpers/attendance.helper.js";

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
    // Oyga mos kun chegarasi (recurring uchun Fev 29 ruxsat - kabisa yillarda ishlaydi)
    const m = body.month !== undefined ? Number(body.month) : null;
    if (m) {
      const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
      if (d > maxDay) {
        throw new ApiError(
          400,
          `${m}-oy uchun kun ${maxDay} dan oshmasligi kerak`,
        );
      }
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

  const doc = await Holiday.create({
    name: trimmed,
    isRecurring,
    month: Number(body.month),
    day: Number(body.day),
    year,
    message: String(body.message),
    audience: body.audience || "all",
    createdBy: currentUser?._id || null,
  });
  invalidateHolidayCache();
  return doc;
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
  invalidateHolidayCache();
  return doc;
};

export const softRemove = async (id) => {
  const doc = await getById(id);
  doc.isActive = false;
  await doc.save();
  invalidateHolidayCache();
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

// Aktiv bayramlar ro'yxatining qisqa muddatli keshi (har so'rovda DB urilmasin).
// Bayram CRUD juda kam, davomat hot path'i tez-tez chaqiriladi.
// Per-process kesh - TTL qisqa (60s) tutiladi: bayram CRUD kam, lekin ko'p-instansli
// deploy'da boshqa instans keshini invalidate qila olmaydi, shuning uchun eskirish
// oynasi 60s bilan cheklanadi (bir instansda CRUD bo'lsa o'sha instans darrov tozalaydi).
let _holidayCache = null; // { audiencesKey, expires, holidays }
const HOLIDAY_CACHE_TTL_MS = 60 * 1000;

export const invalidateHolidayCache = () => {
  _holidayCache = null;
};

const loadActiveHolidays = async (audiences) => {
  const key = audiences.slice().sort().join(",");
  if (
    _holidayCache &&
    _holidayCache.audiencesKey === key &&
    _holidayCache.expires > Date.now()
  ) {
    return _holidayCache.holidays;
  }
  const holidays = await Holiday.find({
    isActive: true,
    audience: { $in: audiences },
  }).lean();
  _holidayCache = {
    audiencesKey: key,
    holidays,
    expires: Date.now() + HOLIDAY_CACHE_TTL_MS,
  };
  return holidays;
};

// [from, to] oralig'ida o'quvchilarga taalluqli bayram kunlarining dateKey Set'i.
// Davomat hisobida shu kunlar dars kuni emas deb qaraladi → foizga ta'sir qilmaydi.
// Recurring (har yil) va one-time (ma'lum yil) bayramlar ham qamrab olinadi.
export const holidayKeySetForRange = async (
  from,
  to,
  audiences = ["all", "students"],
) => {
  const start = toUtcMidnight(from).getTime();
  const end = toUtcMidnight(to).getTime();
  if (!(start <= end)) return new Set();

  const holidays = await loadActiveHolidays(audiences);

  const fromYear = new Date(start).getUTCFullYear();
  const toYear = new Date(end).getUTCFullYear();

  const set = new Set();
  for (const h of holidays) {
    const years = h.isRecurring
      ? Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i)
      : [h.year];
    for (const y of years) {
      if (!y) continue;
      const d = new Date(Date.UTC(y, h.month - 1, h.day, 0, 0, 0, 0));
      // Date overflow qo'riqlovi: noto'g'ri kun (mas. Fev 29 kabisa bo'lmagan yil,
      // 30-kunlik oyda 31) keyingi oyga "ko'chib" ketmasligi uchun tekshiramiz.
      if (d.getUTCMonth() !== h.month - 1 || d.getUTCDate() !== h.day) continue;
      const t = d.getTime();
      if (t >= start && t <= end) set.add(dateKeyOf(d));
    }
  }
  return set;
};
