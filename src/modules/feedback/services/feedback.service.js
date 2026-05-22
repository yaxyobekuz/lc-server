import mongoose from "mongoose";
import Feedback from "../../../models/feedback.model.js";
import FeedbackType from "../../../models/feedbackType.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";

const FEEDBACK_STATUS_LABEL = {
  new: "Yangi",
  in_review: "Ko'rib chiqilmoqda",
  resolved: "Hal qilindi",
  rejected: "Rad etildi",
};

const TYPE_PROJECTION = { name: 1, isActive: 1 };
const GROUP_PROJECTION = { name: 1 };
const USER_PROJECTION = { firstName: 1, lastName: 1, role: 1 };

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ensureType = async (typeId) => {
  const t = await FeedbackType.findById(typeId);
  if (!t) throw new ApiError(400, "Feedback turi topilmadi");
  return t;
};

const ensureGroup = async (groupId) => {
  if (!groupId) return null;
  const g = await Group.findById(groupId);
  if (!g) throw new ApiError(400, "Guruh topilmadi");
  return g;
};

export const submit = async (body, currentUser) => {
  await ensureType(body.type);
  await ensureGroup(body.group);

  const isAnonymous = !!body.isAnonymous;
  const message = String(body.message || "").trim();
  if (message.length < 5) {
    throw new ApiError(400, "Matn kamida 5 belgidan iborat bo'lishi kerak");
  }

  const doc = await Feedback.create({
    author: isAnonymous ? null : currentUser._id,
    authorRoleSnapshot: currentUser.role,
    isAnonymous,
    type: body.type,
    group: body.group || null,
    message,
    status: "new",
  });
  return doc;
};

export const list = async ({
  type,
  status,
  search,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) => {
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (search && search.trim()) {
    filter.message = { $regex: escapeRegex(search.trim()), $options: "i" };
  }
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Feedback.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("type", TYPE_PROJECTION)
      .populate("group", GROUP_PROJECTION)
      .populate("author", USER_PROJECTION)
      .populate("repliedBy", USER_PROJECTION),
    Feedback.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await Feedback.findById(id)
    .populate("type", TYPE_PROJECTION)
    .populate("group", GROUP_PROJECTION)
    .populate("author", USER_PROJECTION)
    .populate("repliedBy", USER_PROJECTION)
    .populate("reviewedBy", USER_PROJECTION)
    .populate("resolvedBy", USER_PROJECTION);
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  return doc;
};

export const getMyFeedback = async (
  userId,
  { page = 1, limit = 20 } = {},
) => {
  const filter = { author: userId };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Feedback.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("type", TYPE_PROJECTION)
      .populate("group", GROUP_PROJECTION)
      .populate("repliedBy", USER_PROJECTION),
    Feedback.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

const assertCanTransition = (currentStatus, nextStatus) => {
  // Reverse transition (rejected/resolved → new) taqiqlanadi
  if (currentStatus === "rejected" || currentStatus === "resolved") {
    if (nextStatus === "new" || nextStatus === "in_review") {
      throw new ApiError(409, "Yopilgan feedback'ni qayta ochib bo'lmaydi");
    }
  }
};

const notifyStatusChangeAsync = async (feedback, action, currentUser) => {
  if (!feedback?.author || feedback.isAnonymous) return;
  try {
    const { notifyFeedbackStatusChange } = await import(
      "../../notifications/services/notifications.service.js"
    );
    await notifyFeedbackStatusChange(
      feedback,
      {
        statusLabel: FEEDBACK_STATUS_LABEL[action] || action,
        adminReply: feedback.adminReply,
        rejectionReason: feedback.rejectionReason,
      },
      currentUser,
    );
  } catch {
    /* silent - notification fail bo'lsa feedback amal qaytmasin */
  }
};

export const markReviewed = async (id, currentUser) => {
  const doc = await Feedback.findById(id);
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  if (doc.status !== "new") {
    throw new ApiError(
      409,
      "Faqat 'Yangi' holatdagi feedback'ni ko'rib chiqishga belgilash mumkin",
    );
  }
  doc.status = "in_review";
  doc.reviewedBy = currentUser._id;
  doc.reviewedAt = new Date();
  await doc.save();
  await notifyStatusChangeAsync(doc, "in_review", currentUser);
  return getById(doc._id);
};

export const reply = async (id, body, currentUser) => {
  const doc = await Feedback.findById(id);
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  const message = String(body.message || "").trim();
  if (!message) throw new ApiError(400, "Javob matni bo'sh bo'lmasligi kerak");

  doc.adminReply = message;
  doc.repliedBy = currentUser._id;
  doc.repliedAt = new Date();
  await doc.save();
  return getById(doc._id);
};

export const resolve = async (id, body, currentUser) => {
  const doc = await Feedback.findById(id);
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  assertCanTransition(doc.status, "resolved");

  if (body?.adminReply !== undefined) {
    doc.adminReply = String(body.adminReply || "").trim();
    if (doc.adminReply) {
      doc.repliedBy = currentUser._id;
      doc.repliedAt = new Date();
    }
  }
  doc.status = "resolved";
  doc.resolvedBy = currentUser._id;
  doc.resolvedAt = new Date();
  await doc.save();

  await notifyStatusChangeAsync(doc, "resolved", currentUser);
  return getById(doc._id);
};

export const reject = async (id, body, currentUser) => {
  const doc = await Feedback.findById(id);
  if (!doc) throw new ApiError(404, "Feedback topilmadi");
  assertCanTransition(doc.status, "rejected");

  const reason = String(body?.rejectionReason || "").trim();
  if (!reason) throw new ApiError(400, "Rad etish sababi kerak");

  doc.rejectionReason = reason;
  doc.status = "rejected";
  doc.resolvedBy = currentUser._id;
  doc.resolvedAt = new Date();
  await doc.save();

  await notifyStatusChangeAsync(doc, "rejected", currentUser);
  return getById(doc._id);
};

export const getStats = async ({ fromDate, toDate } = {}) => {
  const range = {};
  if (fromDate || toDate) {
    range.createdAt = {};
    if (fromDate) range.createdAt.$gte = new Date(fromDate);
    if (toDate) range.createdAt.$lte = new Date(toDate);
  }

  const [total, byStatus, byType] = await Promise.all([
    Feedback.countDocuments(range),
    Feedback.aggregate([
      { $match: range },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Feedback.aggregate([
      { $match: range },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: FeedbackType.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "type",
        },
      },
      { $unwind: { path: "$type", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          typeId: "$_id",
          name: "$type.name",
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]),
  ]);

  return { total, byStatus, byType };
};

// Foydalanuvchi o'z feedback'iga kirishi mumkinligi
export const ensureOwnerOrAuthor = (feedback, user) => {
  if (user.role === "owner") return true;
  if (
    !feedback.isAnonymous &&
    feedback.author &&
    String(feedback.author._id || feedback.author) === String(user._id)
  ) {
    return true;
  }
  throw new ApiError(403, "Ruxsat yo'q");
};

// Mongo session yordamchisi (kelajakda kerak bo'lishi mumkin, hozir ishlatilmaydi)
export { mongoose };
