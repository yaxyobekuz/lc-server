import Lead from "../../../models/lead.model.js";
import LeadOption from "../../../models/leadOption.model.js";
import ApiError from "../../../utils/ApiError.js";
import { normalizePhone } from "../../../utils/phone.js";
import { LEAD_PIPELINE } from "../../../constants/leadStatus.js";
import * as authService from "../../auth/services/auth.service.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const POPULATE = [
  { path: "source", select: { name: 1 } },
  { path: "direction", select: { name: 1 } },
  { path: "rejectionReason", select: { name: 1 } },
];

export const list = async ({
  status,
  source,
  direction,
  search,
  from,
  to,
  page = 1,
  limit = 20,
}) => {
  const filter = {};
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (direction) filter.direction = direction;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (search && search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), "i");
    filter.$or = [{ firstName: rx }, { lastName: rx }, { phone: rx }];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(POPULATE),
    Lead.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const lead = await Lead.findById(id).populate(POPULATE);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  return lead;
};

const normalizeOptionalPhone = (raw) => {
  if (!raw) return null;
  const p = normalizePhone(raw);
  if (!p) throw new ApiError(400, "Telefon raqam noto'g'ri");
  return p;
};

export const create = async (body, currentUser) => {
  const phone = normalizeOptionalPhone(body.phone);
  if (!phone) throw new ApiError(400, "Telefon kerak");

  const exists = await Lead.findOne({ phone });
  if (exists) throw new ApiError(409, "Bu telefon raqamli lid allaqachon mavjud");

  const status = body.status || "new";

  const lead = await Lead.create({
    firstName: String(body.firstName).trim(),
    lastName: body.lastName ? String(body.lastName).trim() : "",
    age: body.age ?? null,
    phone,
    parentPhone: body.parentPhone ? normalizeOptionalPhone(body.parentPhone) : null,
    source: body.sourceId || null,
    direction: body.directionId || null,
    status,
    rejectionReason: body.rejectionReasonId || null,
    trialDate: body.trialDate ? new Date(body.trialDate) : null,
    notes: body.notes || "",
    createdBy: currentUser?._id || null,
    statusHistory: [
      { status, at: new Date(), by: currentUser?._id || null },
    ],
  });
  return getById(lead._id);
};

export const update = async (id, body, currentUser) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");

  if (body.firstName !== undefined) lead.firstName = String(body.firstName).trim();
  if (body.lastName !== undefined) lead.lastName = String(body.lastName).trim();
  if (body.age !== undefined) lead.age = body.age ?? null;
  if (body.phone !== undefined) {
    const phone = normalizeOptionalPhone(body.phone);
    const exists = await Lead.findOne({ phone, _id: { $ne: lead._id } });
    if (exists) throw new ApiError(409, "Bu telefon raqamli lid allaqachon mavjud");
    lead.phone = phone;
  }
  if (body.parentPhone !== undefined) {
    lead.parentPhone = body.parentPhone
      ? normalizeOptionalPhone(body.parentPhone)
      : null;
  }
  if (body.sourceId !== undefined) lead.source = body.sourceId || null;
  if (body.directionId !== undefined) lead.direction = body.directionId || null;
  if (body.rejectionReasonId !== undefined) {
    lead.rejectionReason = body.rejectionReasonId || null;
  }
  if (body.trialDate !== undefined) {
    lead.trialDate = body.trialDate ? new Date(body.trialDate) : null;
  }
  if (body.notes !== undefined) lead.notes = body.notes || "";

  if (body.status !== undefined && body.status !== lead.status) {
    lead.status = body.status;
    lead.statusHistory.push({
      status: body.status,
      at: new Date(),
      by: currentUser?._id || null,
    });
  }

  await lead.save();
  return getById(lead._id);
};

// Qayta bog'lanish eslatmasini o'rnatish/o'zgartirish/o'chirish
export const setReminder = async (id, { followUpAt, followUpNote }) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");

  lead.followUpAt = followUpAt ? new Date(followUpAt) : null;
  lead.followUpNote = followUpNote || "";
  // Yangi/yangilangan eslatma qayta yuborilishi uchun bayroqni tozalaymiz
  lead.followUpNotifiedAt = null;

  await lead.save();
  return getById(lead._id);
};

// Vaqti kelgan, hali bildirishnoma yuborilmagan eslatmalar (job uchun)
export const dueReminders = async (now = new Date()) =>
  Lead.find({
    followUpAt: { $ne: null, $lte: now },
    followUpNotifiedAt: null,
  }).lean();

export const markReminderNotified = async (id, at = new Date()) => {
  await Lead.updateOne({ _id: id }, { $set: { followUpNotifiedAt: at } });
};

export const remove = async (id) => {
  const lead = await Lead.findByIdAndDelete(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  return { _id: id };
};

// Lidni o'quvchiga aylantirish: o'quvchi yaratiladi + lid bog'lanadi
export const convert = async (id, body, currentUser) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  if (lead.studentId) {
    throw new ApiError(409, "Bu lid allaqachon o'quvchiga aylantirilgan");
  }

  const student = await authService.registerUser({ ...body, role: "student" });

  lead.studentId = student._id;
  if (lead.status !== "enrolled") {
    lead.status = "enrolled";
    lead.statusHistory.push({
      status: "enrolled",
      at: new Date(),
      by: currentUser?._id || null,
    });
  }
  await lead.save();
  return { lead: await getById(lead._id), student };
};

// Statistika: voronka, manba/yo'nalish samaradorligi, drop-off
export const stats = async ({ from, to } = {}) => {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }

  const leads = await Lead.find(match, {
    status: 1,
    statusHistory: 1,
    source: 1,
    direction: 1,
  }).lean();

  // Faqat aktiv (o'chirilmagan) sozlamalar. O'chirilgan yoki yo'q bo'lib
  // ketgan manba/yo'nalishlar statistikada alohida ko'rinmasligi kerak -
  // ular "Noma'lum" guruhiga qo'shiladi.
  const options = await LeadOption.find({ isActive: true }, { name: 1 }).lean();
  const nameOf = new Map(options.map((o) => [String(o._id), o.name]));

  const total = leads.length;
  const pipeIndex = (s) => LEAD_PIPELINE.indexOf(s);

  // Har lid uchun voronkada erishilgan eng uzoq bosqich indeksi
  const furthestOf = (lead) => {
    let max = pipeIndex(lead.status);
    for (const h of lead.statusHistory || []) {
      const i = pipeIndex(h.status);
      if (i > max) max = i;
    }
    return max; // -1 agar pipeline'da bo'lmasa (mas. faqat rejected)
  };

  const byStatus = {};
  const funnelCounts = new Array(LEAD_PIPELINE.length).fill(0);
  const dropOff = new Array(LEAD_PIPELINE.length).fill(0);
  const srcAgg = new Map(); // id -> {total, enrolled}
  const dirAgg = new Map();

  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;

    const furthest = furthestOf(lead);
    for (let i = 0; i <= furthest; i++) funnelCounts[i] += 1;

    if (lead.status === "rejected" && furthest >= 0) {
      dropOff[furthest] += 1;
    }

    const isEnrolled = lead.status === "enrolled";
    // Aktiv sozlamaga bog'lanmagan (o'chirilgan / yo'q) id'lar "none" -> Noma'lum
    const rawSrc = lead.source ? String(lead.source) : null;
    const rawDir = lead.direction ? String(lead.direction) : null;
    const sKey = rawSrc && nameOf.has(rawSrc) ? rawSrc : "none";
    const dKey = rawDir && nameOf.has(rawDir) ? rawDir : "none";
    if (!srcAgg.has(sKey)) srcAgg.set(sKey, { total: 0, enrolled: 0 });
    if (!dirAgg.has(dKey)) dirAgg.set(dKey, { total: 0, enrolled: 0 });
    srcAgg.get(sKey).total += 1;
    dirAgg.get(dKey).total += 1;
    if (isEnrolled) {
      srcAgg.get(sKey).enrolled += 1;
      dirAgg.get(dKey).enrolled += 1;
    }
  }

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const toRows = (agg) =>
    Array.from(agg.entries())
      .map(([key, v]) => ({
        id: key === "none" ? null : key,
        name: key === "none" ? "Noma'lum" : nameOf.get(key),
        total: v.total,
        enrolled: v.enrolled,
        conversionRate: pct(v.enrolled, v.total),
      }))
      .sort((a, b) => b.total - a.total);

  const funnel = LEAD_PIPELINE.map((stage, i) => ({
    stage,
    count: funnelCounts[i],
    rate: pct(funnelCounts[i], total),
  }));

  const idxTrial = LEAD_PIPELINE.indexOf("trial");
  const idxTrialAttended = LEAD_PIPELINE.indexOf("trial_attended");
  const idxEnrolled = LEAD_PIPELINE.indexOf("enrolled");

  const dropOffByStage = LEAD_PIPELINE.map((stage, i) => ({
    stage,
    count: dropOff[i],
  }));

  return {
    total,
    byStatus,
    funnel,
    rates: {
      leadToTrial: pct(funnelCounts[idxTrial], total),
      trialToEnrolled: pct(
        funnelCounts[idxEnrolled],
        funnelCounts[idxTrialAttended],
      ),
      overallConversion: pct(funnelCounts[idxEnrolled], total),
    },
    bySource: toRows(srcAgg),
    byDirection: toRows(dirAgg),
    dropOffByStage,
  };
};
