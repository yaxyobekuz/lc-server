import ArchiveReason from "../../../models/archiveReason.model.js";
import ArchiveLog from "../../../models/archiveLog.model.js";
import ApiError from "../../../utils/ApiError.js";

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
    filter.title = { $regex: escapeRegex(search.trim()), $options: "i" };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ArchiveReason.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ArchiveReason.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await ArchiveReason.findById(id);
  if (!doc) throw new ApiError(404, "Sabab topilmadi");
  return doc;
};

export const create = async (body, currentUser) => {
  const title = String(body.title || "").trim();
  if (!title) throw new ApiError(400, "Sarlavha kerak");
  return ArchiveReason.create({ title, createdBy: currentUser?._id || null });
};

export const update = async (id, body) => {
  const doc = await getById(id);
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) throw new ApiError(400, "Sarlavha kerak");
    doc.title = title;
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

// Arxivlash/qaytarish amalini logga yozadi (users servisidan chaqiriladi)
export const logAction = async ({ user, action, reasonId, by }) => {
  let reason = null;
  let reasonTitle = "";
  if (reasonId) {
    const r = await ArchiveReason.findById(reasonId, { title: 1 }).lean();
    if (r) {
      reason = r._id;
      reasonTitle = r.title;
    }
  }
  await ArchiveLog.create({
    user,
    action,
    reason,
    reasonTitle,
    performedBy: by || null,
  });
};

// Sabab bo'yicha hisobot: har sabab uchun arxivlangan/qaytarilgan sonlari
export const report = async ({ from, to, action } = {}) => {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }
  if (action) match.action = action;

  const rows = await ArchiveLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$reason",
        archiveCount: {
          $sum: { $cond: [{ $eq: ["$action", "archive"] }, 1, 0] },
        },
        restoreCount: {
          $sum: { $cond: [{ $eq: ["$action", "restore"] }, 1, 0] },
        },
        total: { $sum: 1 },
        lastTitle: { $last: "$reasonTitle" },
      },
    },
    { $sort: { total: -1 } },
  ]);

  const reasonIds = rows.map((r) => r._id).filter(Boolean);
  const reasons = reasonIds.length
    ? await ArchiveReason.find({ _id: { $in: reasonIds } }, { title: 1 }).lean()
    : [];
  const titleMap = new Map(reasons.map((r) => [String(r._id), r.title]));

  return rows.map((r) => ({
    reasonId: r._id ? String(r._id) : null,
    title: r._id
      ? titleMap.get(String(r._id)) || r.lastTitle || "(o'chirilgan sabab)"
      : "Sababsiz",
    archiveCount: r.archiveCount,
    restoreCount: r.restoreCount,
    total: r.total,
  }));
};
