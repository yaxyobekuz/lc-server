import SystemNotification from "../../../models/systemNotification.model.js";
import ApiError from "../../../utils/ApiError.js";

// Saqlanadigan maksimal bildirishnoma soni - oshganda eng eskilari o'chiriladi.
export const MAX_SYSTEM_NOTIFICATIONS = 100;

// status: "all" | "read" | "unread"
export const list = async ({ status = "all", page = 1, limit = 20 }) => {
  const filter = {};
  if (status === "read") filter.isRead = true;
  if (status === "unread") filter.isRead = false;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    SystemNotification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SystemNotification.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getUnreadCount = async () =>
  SystemNotification.countDocuments({ isRead: false });

export const markRead = async (id) => {
  const doc = await SystemNotification.findById(id);
  if (!doc) throw new ApiError(404, "Bildirishnoma topilmadi");
  if (!doc.isRead) {
    doc.isRead = true;
    doc.readAt = new Date();
    await doc.save();
  }
  return doc;
};

export const markAllRead = async () => {
  const res = await SystemNotification.updateMany(
    { isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  return { modified: res.modifiedCount || 0 };
};

// Yangi tizim bildirishnomasi yaratish - boshqa modullar shu funksiyani chaqiradi.
export const create = async ({ message, link = null } = {}) => {
  const text = String(message || "").trim();
  if (!text) throw new ApiError(400, "Bildirishnoma matni kerak");

  const doc = await SystemNotification.create({
    message: text,
    link: link ? String(link).trim() : null,
  });

  await enforceMaxDocuments();
  return doc;
};

// Cap: jami soni MAX dan oshsa, eng eski hujjatlarni o'chiramiz.
const enforceMaxDocuments = async () => {
  const count = await SystemNotification.countDocuments();
  if (count <= MAX_SYSTEM_NOTIFICATIONS) return;

  const overflow = count - MAX_SYSTEM_NOTIFICATIONS;
  const oldest = await SystemNotification.find()
    .sort({ createdAt: 1 })
    .limit(overflow)
    .select("_id");

  if (oldest.length) {
    await SystemNotification.deleteMany({
      _id: { $in: oldest.map((d) => d._id) },
    });
  }
};
