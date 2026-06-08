import mongoose from "mongoose";
import Lead, { TRIAL_OUTCOMES } from "../../../models/lead.model.js";
import LeadStatus from "../../../models/leadStatus.model.js";
import LeadSource from "../../../models/leadSource.model.js";
import LeadDirection from "../../../models/leadDirection.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  findInitial,
  findConvertedFlag,
} from "../../leadStatuses/services/leadStatuses.service.js";
import { registerUser as authRegisterUser } from "../../auth/services/auth.service.js";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const STATUS_PROJECTION = { name: 1, color: 1, isFinal: 1, isConverted: 1 };
const SOURCE_PROJECTION = { name: 1, isActive: 1 };
const DIRECTION_PROJECTION = { name: 1, isActive: 1 };
const USER_PROJECTION = { firstName: 1, lastName: 1, role: 1 };
const GROUP_PROJECTION = { name: 1, schedule: 1 };

const utcDayStart = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const utcDayEnd = (d = new Date()) =>
  new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999),
  );

const ensureOwner = async (userId) => {
  if (!userId) return null;
  const u = await User.findById(userId);
  if (!u || u.role !== ROLES.OWNER) {
    throw new ApiError(400, "Mas'ul faqat owner rolidagi foydalanuvchi bo'lishi mumkin");
  }
  return u;
};

const ensureSource = async (id) => {
  if (!id) return null;
  const s = await LeadSource.findById(id);
  if (!s) throw new ApiError(400, "Lead manba topilmadi");
  return s;
};

const ensureDirection = async (id) => {
  if (!id) return null;
  const d = await LeadDirection.findById(id);
  if (!d) throw new ApiError(400, "Yo'nalish topilmadi");
  return d;
};

const ensureGroup = async (id) => {
  if (!id) return null;
  const g = await Group.findById(id);
  if (!g) throw new ApiError(400, "Guruh topilmadi");
  return g;
};

const runWithSession = async (fn) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    session.endSession();
    return result;
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        /* noop */
      }
      session.endSession();
    }
    if (
      err?.code === 20 ||
      err?.codeName === "IllegalOperation" ||
      err?.message?.includes("Transaction") ||
      err?.message?.includes("replica set")
    ) {
      return fn(null);
    }
    throw err;
  }
};

export const list = async ({
  status,
  source,
  direction,
  assignedTo,
  search,
  hasFollowUp,
  overdue,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) => {
  const filter = { isDeleted: { $ne: true } };
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (direction) filter.direction = direction;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (search && String(search).trim()) {
    const re = escapeRegex(String(search).trim());
    filter.$or = [
      { firstName: { $regex: re, $options: "i" } },
      { lastName: { $regex: re, $options: "i" } },
      { phone: { $regex: re, $options: "i" } },
    ];
  }
  if (hasFollowUp) filter.followUpDate = { $ne: null };
  if (overdue) {
    filter.followUpDate = { ...(filter.followUpDate || {}), $lt: utcDayStart() };
    // Open leads only - final bo'lmaganlar
  }
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("status", STATUS_PROJECTION)
      .populate("source", SOURCE_PROJECTION)
      .populate("direction", DIRECTION_PROJECTION)
      .populate("assignedTo", USER_PROJECTION)
      .populate("convertedUser", USER_PROJECTION),
    Lead.countDocuments(filter),
  ]);

  // Overdue uchun: open status (isFinal=false) bo'lganlarini filter qilish
  let result = items;
  if (overdue) {
    result = items.filter((l) => l.status && !l.status.isFinal);
  }

  return { items: result, total, page, limit };
};

export const getById = async (id) => {
  const lead = await Lead.findById(id)
    .populate("status", STATUS_PROJECTION)
    .populate("source", SOURCE_PROJECTION)
    .populate("direction", DIRECTION_PROJECTION)
    .populate("assignedTo", USER_PROJECTION)
    .populate("trialGroup", GROUP_PROJECTION)
    .populate("convertedUser", USER_PROJECTION)
    .populate("createdBy", USER_PROJECTION)
    .populate("history.createdBy", USER_PROJECTION)
    .populate("history.fromStatus", STATUS_PROJECTION)
    .populate("history.toStatus", STATUS_PROJECTION);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  return lead;
};

export const create = async (body, currentUser) => {
  await ensureSource(body.source);
  await ensureDirection(body.direction);
  await ensureOwner(body.assignedTo);

  const initial = await findInitial();
  if (!initial) {
    throw new ApiError(
      500,
      "Boshlang'ich (isInitial=true) status topilmadi. Avval seed ishga tushiring.",
    );
  }

  const doc = await Lead.create({
    firstName: String(body.firstName).trim(),
    lastName: body.lastName ? String(body.lastName).trim() : "",
    phone: String(body.phone).trim(),
    birthDate: body.birthDate ? new Date(body.birthDate) : null,
    source: body.source || null,
    direction: body.direction || null,
    status: initial._id,
    assignedTo: body.assignedTo || null,
    requestDate: body.requestDate ? new Date(body.requestDate) : new Date(),
    notes: body.notes || "",
    history: [
      {
        type: "note",
        toStatus: initial._id,
        message: "Lid yaratildi",
        createdBy: currentUser?._id || null,
        createdAt: new Date(),
      },
    ],
    createdBy: currentUser?._id || null,
  });
  return getById(doc._id);
};

export const update = async (id, body, currentUser) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");

  if (body.source !== undefined) await ensureSource(body.source);
  if (body.direction !== undefined) await ensureDirection(body.direction);

  let assignedChanged = false;
  if (body.assignedTo !== undefined) {
    if (body.assignedTo) await ensureOwner(body.assignedTo);
    if (String(lead.assignedTo || "") !== String(body.assignedTo || "")) {
      assignedChanged = true;
    }
  }

  if (body.firstName !== undefined) lead.firstName = String(body.firstName).trim();
  if (body.lastName !== undefined) lead.lastName = String(body.lastName).trim();
  if (body.phone !== undefined) lead.phone = String(body.phone).trim();
  if (body.birthDate !== undefined) {
    lead.birthDate = body.birthDate ? new Date(body.birthDate) : null;
  }
  if (body.source !== undefined) lead.source = body.source || null;
  if (body.direction !== undefined) lead.direction = body.direction || null;
  if (body.assignedTo !== undefined) lead.assignedTo = body.assignedTo || null;
  if (body.notes !== undefined) lead.notes = String(body.notes);
  if (body.rejectionReason !== undefined) {
    lead.rejectionReason = body.rejectionReason || null;
  }
  if (body.rejectionNote !== undefined) {
    lead.rejectionNote = String(body.rejectionNote);
  }

  if (assignedChanged) {
    lead.history.push({
      type: "reassigned",
      message: body.assignedTo ? "Yangi mas'ul biriktirildi" : "Mas'ul olib tashlandi",
      meta: { assignedTo: body.assignedTo || null },
      createdBy: currentUser?._id || null,
      createdAt: new Date(),
    });
  }

  await lead.save();
  return getById(lead._id);
};

export const remove = async (id) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  if (lead.convertedUser) {
    throw new ApiError(
      409,
      "O'quvchiga aylangan lidni o'chirib bo'lmaydi (audit aloqasi yo'qoladi)",
    );
  }
  await lead.softDelete();
  return { ok: true };
};

export const changeStatus = async (id, statusId, message, currentUser) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");

  const newStatus = await LeadStatus.findById(statusId);
  if (!newStatus || !newStatus.isActive) {
    throw new ApiError(400, "Status topilmadi yoki faol emas");
  }
  if (newStatus.isConverted) {
    throw new ApiError(
      400,
      "O'quvchiga aylangan statusga o'tish uchun /convert endpointidan foydalaning",
    );
  }
  if (String(lead.status) === String(newStatus._id)) {
    return getById(lead._id);
  }

  const fromStatus = lead.status;
  lead.status = newStatus._id;
  lead.history.push({
    type: "status_change",
    fromStatus,
    toStatus: newStatus._id,
    message: message || "",
    createdBy: currentUser?._id || null,
    createdAt: new Date(),
  });
  await lead.save();
  return getById(lead._id);
};

export const addNote = async (id, message, currentUser) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  const trimmed = String(message || "").trim();
  if (!trimmed) throw new ApiError(400, "Eslatma bo'sh bo'lmasligi kerak");

  lead.history.push({
    type: "note",
    message: trimmed,
    createdBy: currentUser?._id || null,
    createdAt: new Date(),
  });
  await lead.save();
  return getById(lead._id);
};

export const recordContact = async (id, message, currentUser) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");

  lead.contactCount = (lead.contactCount || 0) + 1;
  lead.lastContactAt = new Date();
  lead.history.push({
    type: "contact",
    message: String(message || ""),
    createdBy: currentUser?._id || null,
    createdAt: new Date(),
  });
  await lead.save();
  return getById(lead._id);
};

export const setFollowUp = async (id, { date, note }, currentUser) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  if (!date) throw new ApiError(400, "Sana kerak");

  lead.followUpDate = new Date(date);
  lead.followUpNote = String(note || "");
  lead.reminderSentAt = null; // qayta yuborish mumkin
  lead.history.push({
    type: "follow_up_set",
    message: lead.followUpNote,
    meta: { followUpDate: lead.followUpDate },
    createdBy: currentUser?._id || null,
    createdAt: new Date(),
  });
  await lead.save();
  return getById(lead._id);
};

export const setTrial = async (id, { date, groupId }, currentUser) => {
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  if (!date) throw new ApiError(400, "Sana kerak");
  await ensureGroup(groupId);

  lead.trialDate = new Date(date);
  lead.trialGroup = groupId || null;
  lead.trialOutcome = null; // sana o'zgarsa natija qayta belgilanadi
  lead.trialOutcomeAt = null;
  lead.history.push({
    type: "trial_set",
    message: "Sinov darsi sozlandi",
    meta: { trialDate: lead.trialDate, groupId: groupId || null },
    createdBy: currentUser?._id || null,
    createdAt: new Date(),
  });
  await lead.save();
  return getById(lead._id);
};

// Sinov darsi natijasini belgilash (keldi/kelmadi). currentUser — trialGroup
// o'qituvchisi yoki owner bo'lishi mumkin (ruxsat handler/route darajasida).
export const recordTrialOutcome = async (id, outcome, currentUser) => {
  if (!TRIAL_OUTCOMES.includes(outcome)) {
    throw new ApiError(400, "Noto'g'ri natija");
  }
  const lead = await Lead.findById(id);
  if (!lead) throw new ApiError(404, "Lid topilmadi");
  if (!lead.trialDate) {
    throw new ApiError(400, "Avval sinov darsi sanasi belgilanishi kerak");
  }

  lead.trialOutcome = outcome;
  lead.trialOutcomeAt = new Date();
  lead.history.push({
    type: "trial_outcome",
    message: outcome === "attended" ? "Sinovga keldi" : "Sinovga kelmadi",
    meta: { outcome, trialDate: lead.trialDate },
    createdBy: currentUser?._id || null,
    createdAt: new Date(),
  });
  await lead.save();
  return getById(lead._id);
};

// Berilgan sana + (ixtiyoriy) guruh bo'yicha sinov darsiga belgilangan lidlar.
// Davomat sahifasida "bugungi sinov o'quvchilari" bo'limi uchun.
export const getTrialsForDate = async (date, groupId = null) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return [];
  const filter = {
    trialDate: { $gte: utcDayStart(d), $lte: utcDayEnd(d) },
    isDeleted: { $ne: true },
  };
  if (groupId) filter.trialGroup = groupId;
  return Lead.find(filter)
    .select(
      "firstName lastName phone trialDate trialGroup trialOutcome trialOutcomeAt status",
    )
    .populate("status", STATUS_PROJECTION)
    .sort({ trialDate: 1 })
    .lean();
};

export const convertToStudent = async (id, userBody, currentUser) => {
  return runWithSession(async (session) => {
    const opts = session ? { session } : {};
    const lead = await Lead.findById(id, null, opts);
    if (!lead) throw new ApiError(404, "Lid topilmadi");
    if (lead.convertedUser) {
      throw new ApiError(409, "Bu lid allaqachon o'quvchiga aylangan");
    }

    const convertedStatus = await findConvertedFlag();
    if (!convertedStatus) {
      throw new ApiError(
        500,
        "isConverted=true status topilmadi. Avval seed ishga tushiring.",
      );
    }

    // User yaratish (auth.service orqali - username/phone unique tekshiruvi shu yerda)
    const user = await authRegisterUser({
      ...userBody,
      role: ROLES.STUDENT,
      leadSource: lead.source ? String(lead.source) : undefined,
    });

    const fromStatus = lead.status;
    lead.convertedUser = user._id;
    lead.convertedAt = new Date();
    lead.status = convertedStatus._id;
    lead.history.push({
      type: "converted",
      fromStatus,
      toStatus: convertedStatus._id,
      message: "O'quvchiga aylantirildi",
      meta: { userId: user._id },
      createdBy: currentUser?._id || null,
      createdAt: new Date(),
    });
    await lead.save(opts);
    return { lead: await getById(lead._id), user };
  });
};

const monthBoundary = (date) => {
  const d = new Date(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  return { start, end };
};

export const getDashboardStats = async ({ fromDate, toDate } = {}) => {
  const range = {};
  if (fromDate || toDate) {
    range.createdAt = {};
    if (fromDate) range.createdAt.$gte = new Date(fromDate);
    if (toDate) range.createdAt.$lte = new Date(toDate);
  }

  const [total, byStatus, statuses] = await Promise.all([
    Lead.countDocuments(range),
    Lead.aggregate([
      { $match: range },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    LeadStatus.find({ isActive: true })
      .sort({ order: 1 })
      .select(STATUS_PROJECTION),
  ]);

  // by-status ni status meta bilan birlashtirish
  const statusMap = new Map(statuses.map((s) => [String(s._id), s]));
  const statusBreakdown = byStatus
    .map((b) => ({
      status: statusMap.get(String(b._id)) || null,
      count: b.count,
    }))
    .filter((b) => b.status)
    .sort((a, b) => (a.status.order || 0) - (b.status.order || 0));

  // Konvertatsiya stats
  const convertedFilter = {
    ...range,
    convertedUser: { $ne: null },
  };
  const converted = await Lead.find(convertedFilter).select({
    createdAt: 1,
    convertedAt: 1,
  });
  const totalConverted = converted.length;
  let avgConversionDays = null;
  if (totalConverted > 0) {
    const sum = converted.reduce((acc, l) => {
      const ms = new Date(l.convertedAt).getTime() - new Date(l.createdAt).getTime();
      return acc + ms / (1000 * 60 * 60 * 24);
    }, 0);
    avgConversionDays = Math.round((sum / totalConverted) * 10) / 10;
  }
  const conversionRate = total > 0 ? Math.round((totalConverted / total) * 100) : 0;

  // Joriy oy yangi lidlar (range bermasa joriy oy)
  const now = new Date();
  const { start: monthStart, end: monthEnd } = monthBoundary(now);
  const newThisMonth = await Lead.countDocuments({
    createdAt: { $gte: monthStart, $lte: monthEnd },
  });

  // Eslatmalar (open status)
  const todayStart = utcDayStart();
  const todayEnd = utcDayEnd();
  const openStatusIds = statuses.filter((s) => !s.isFinal).map((s) => s._id);

  const [todayCount, overdueCount] = await Promise.all([
    Lead.countDocuments({
      followUpDate: { $gte: todayStart, $lte: todayEnd },
      status: { $in: openStatusIds },
    }),
    Lead.countDocuments({
      followUpDate: { $lt: todayStart },
      status: { $in: openStatusIds },
    }),
  ]);

  // So'nggi 6 oy trend
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const { start, end } = monthBoundary(d);
    const [created, conv] = await Promise.all([
      Lead.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Lead.countDocuments({
        convertedAt: { $gte: start, $lte: end },
      }),
    ]);
    monthlyTrend.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      created,
      converted: conv,
    });
  }

  return {
    total,
    totalConverted,
    conversionRate,
    avgConversionDays,
    newThisMonth,
    todayRemindersCount: todayCount,
    overdueRemindersCount: overdueCount,
    statusBreakdown,
    monthlyTrend,
  };
};

export const getSourcePerformance = async ({ fromDate, toDate } = {}) => {
  const match = {};
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) match.createdAt.$lte = new Date(toDate);
  }

  const rows = await Lead.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$source",
        total: { $sum: 1 },
        converted: {
          $sum: {
            $cond: [{ $ifNull: ["$convertedUser", false] }, 1, 0],
          },
        },
        avgConversionMs: {
          $avg: {
            $cond: [
              { $ifNull: ["$convertedAt", false] },
              { $subtract: ["$convertedAt", "$createdAt"] },
              null,
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: LeadSource.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "source",
      },
    },
    { $unwind: { path: "$source", preserveNullAndEmptyArrays: true } },
    { $sort: { total: -1 } },
  ]);

  return rows.map((r) => ({
    source: r.source
      ? { _id: r.source._id, name: r.source.name }
      : { _id: null, name: "Manba ko'rsatilmagan" },
    total: r.total,
    converted: r.converted,
    conversionRate: r.total > 0 ? Math.round((r.converted / r.total) * 100) : 0,
    avgConversionDays: r.avgConversionMs
      ? Math.round((r.avgConversionMs / (1000 * 60 * 60 * 24)) * 10) / 10
      : null,
  }));
};

export const getTodayReminders = async () => {
  const todayStart = utcDayStart();
  const todayEnd = utcDayEnd();
  const openStatuses = await LeadStatus.find({
    isActive: true,
    isFinal: false,
  }).select({ _id: 1 });
  const openIds = openStatuses.map((s) => s._id);

  return Lead.find({
    followUpDate: { $gte: todayStart, $lte: todayEnd },
    status: { $in: openIds },
  })
    .sort({ followUpDate: 1 })
    .populate("status", STATUS_PROJECTION)
    .populate("assignedTo", USER_PROJECTION)
    .populate("source", SOURCE_PROJECTION);
};

export const getOverdueReminders = async () => {
  const todayStart = utcDayStart();
  const openStatuses = await LeadStatus.find({
    isActive: true,
    isFinal: false,
  }).select({ _id: 1 });
  const openIds = openStatuses.map((s) => s._id);

  return Lead.find({
    followUpDate: { $lt: todayStart, $ne: null },
    status: { $in: openIds },
  })
    .sort({ followUpDate: 1 })
    .populate("status", STATUS_PROJECTION)
    .populate("assignedTo", USER_PROJECTION)
    .populate("source", SOURCE_PROJECTION);
};

// Reminder sent flag uchun yordamchi (bot service ishlatadi)
export const markReminderSent = async (leadId) => {
  await Lead.updateOne(
    { _id: leadId },
    { $set: { reminderSentAt: new Date() } },
  );
};
