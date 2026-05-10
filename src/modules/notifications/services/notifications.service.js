import mongoose from "mongoose";
import Notification from "../../../models/notification.model.js";
import NotificationRecipient from "../../../models/notificationRecipient.model.js";
import NotificationTemplate from "../../../models/notificationTemplate.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";

const SENDER_PROJECTION = { firstName: 1, lastName: 1, role: 1 };

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

// Teacher uchun ruxsat etilgan audience type'lar
const TEACHER_ALLOWED_AUDIENCE = new Set(["groups", "users", "individual"]);

// Bitta o'qituvchining barcha guruhlari ID'larini qaytaradi
const getTeacherGroupIds = async (teacherId) => {
  const groups = await Group.find(
    { teachers: teacherId, isActive: true },
    { _id: 1 },
  );
  return groups.map((g) => g._id);
};

// Bitta o'qituvchining barcha active talabalari ID'larini qaytaradi
const getTeacherStudentIds = async (teacherId) => {
  const groupIds = await getTeacherGroupIds(teacherId);
  if (!groupIds.length) return [];
  const memberships = await GroupMembership.find(
    { group: { $in: groupIds }, leftAt: null },
    { student: 1 },
  );
  const set = new Set(memberships.map((m) => String(m.student)));
  return [...set];
};

// Audience'ni recipient userIds[] ga aylantiradi (deduped, active filtered)
export const resolveAudience = async (audience, currentUser) => {
  const isOwner = currentUser?.role === ROLES.OWNER;
  const isTeacher = currentUser?.role === ROLES.TEACHER;
  const isSystem = !currentUser; // Auto job

  if (isTeacher && !TEACHER_ALLOWED_AUDIENCE.has(audience.type)) {
    throw new ApiError(
      403,
      "O'qituvchi faqat o'z guruhlari yoki talabalariga xabar yubora oladi",
    );
  }

  let recipientIds = [];

  switch (audience.type) {
    case "all_students": {
      if (!isOwner && !isSystem) {
        throw new ApiError(403, "Ruxsat yo'q");
      }
      const users = await User.find(
        { role: ROLES.STUDENT, isActive: true },
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    case "all_teachers": {
      if (!isOwner && !isSystem) {
        throw new ApiError(403, "Ruxsat yo'q");
      }
      const users = await User.find(
        { role: ROLES.TEACHER, isActive: true },
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    case "groups": {
      const groupIds = (audience.groupIds || []).map(
        (id) => new mongoose.Types.ObjectId(String(id)),
      );
      if (groupIds.length === 0) {
        throw new ApiError(400, "Kamida bitta guruh tanlanishi kerak");
      }
      if (isTeacher) {
        const myGroupIds = (await getTeacherGroupIds(currentUser._id)).map(
          String,
        );
        const allMine = groupIds.every((id) =>
          myGroupIds.includes(String(id)),
        );
        if (!allMine) {
          throw new ApiError(403, "Faqat o'z guruhlaringizga yubora olasiz");
        }
      }
      const memberships = await GroupMembership.find(
        { group: { $in: groupIds }, leftAt: null },
        { student: 1 },
      );
      const set = new Set(memberships.map((m) => String(m.student)));
      recipientIds = [...set];
      break;
    }
    case "users":
    case "individual":
    case "feedback_author": {
      const userIds = (audience.userIds || []).map(String);
      if (userIds.length === 0) {
        throw new ApiError(400, "Kamida bitta foydalanuvchi tanlanishi kerak");
      }
      if (isTeacher) {
        // Teacher faqat o'z guruhi talabalari
        const myStudents = new Set(await getTeacherStudentIds(currentUser._id));
        const allMine = userIds.every((id) => myStudents.has(id));
        if (!allMine) {
          throw new ApiError(
            403,
            "Faqat o'z guruh talabalaringizga yubora olasiz",
          );
        }
      }
      const users = await User.find(
        { _id: { $in: userIds }, isActive: true },
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    case "auto_system": {
      // Auto job o'zi userIds beradi
      recipientIds = (audience.userIds || []).map(
        (id) => new mongoose.Types.ObjectId(String(id)),
      );
      break;
    }
    default:
      throw new ApiError(400, "Noto'g'ri audience turi");
  }

  // Deduplicate
  const uniqueSet = new Set(recipientIds.map(String));
  return [...uniqueSet].map((id) => new mongoose.Types.ObjectId(id));
};

// Bot push (transaction tashqarisida)
const dispatchBotPush = async (notification, recipientIds) => {
  let deliveredCount = 0;
  // Lazy import — circular dep oldini olish
  const { deliverToUser } = await import(
    "../../../bot/services/notificationDeliver.service.js"
  );

  for (const userId of recipientIds) {
    try {
      const result = await deliverToUser(userId, {
        title: notification.title,
        body: notification.body,
        category: notification.category,
      });
      if (result.ok) {
        await NotificationRecipient.updateOne(
          { notification: notification._id, user: userId },
          { $set: { botDeliveredAt: new Date() } },
        );
        deliveredCount += 1;
      } else if (result.reason) {
        await NotificationRecipient.updateOne(
          { notification: notification._id, user: userId },
          { $set: { botFailedReason: result.reason } },
        );
      }
    } catch (err) {
      await NotificationRecipient.updateOne(
        { notification: notification._id, user: userId },
        { $set: { botFailedReason: String(err?.message || "unknown") } },
      ).catch(() => null);
    }
  }

  if (deliveredCount > 0) {
    await Notification.updateOne(
      { _id: notification._id },
      { $set: { deliveredViaBot: deliveredCount } },
    );
  }
};

// Asosiy send
export const send = async (body, currentUser) => {
  const recipientIds = await resolveAudience(body.audience, currentUser);

  // Template snapshot (ixtiyoriy)
  let templateRef = null;
  let finalBody = String(body.body || "").trim();
  let finalCategory = body.category || "other";

  if (body.templateId) {
    const tpl = await NotificationTemplate.findById(body.templateId);
    if (!tpl) throw new ApiError(400, "Shablon topilmadi");
    templateRef = tpl._id;
    if (!finalBody) finalBody = tpl.body;
    if (finalCategory === "other") finalCategory = "template_based";
  }

  if (!finalBody) {
    throw new ApiError(400, "Xabar matni bo'sh bo'lmasligi kerak");
  }

  const senderRole = currentUser
    ? currentUser.role === ROLES.OWNER
      ? "owner"
      : "teacher"
    : "system";

  const notification = await runWithSession(async (session) => {
    const opts = session ? { session } : {};
    const created = await Notification.create(
      [
        {
          sender: currentUser?._id || null,
          senderRole,
          title: body.title || "",
          body: finalBody,
          category: finalCategory,
          template: templateRef,
          audience: body.audience,
          recipientsCount: recipientIds.length,
          deliveredViaBot: 0,
          readCount: 0,
          isAuto: !!body.isAuto,
          relatedFeedback: body.relatedFeedback || null,
          sentAt: new Date(),
        },
      ],
      session ? { session } : undefined,
    );
    const notif = created[0];

    if (recipientIds.length > 0) {
      const docs = recipientIds.map((uid) => ({
        notification: notif._id,
        user: uid,
        readAt: null,
      }));
      await NotificationRecipient.insertMany(docs, {
        ...opts,
        ordered: false,
      });
    }
    return notif;
  });

  // Bot push (async, transaction tashqarisida)
  // Promise'ni await qilamiz, lekin xato bo'lsa silent
  await dispatchBotPush(notification, recipientIds).catch(() => null);

  return notification;
};

export const list = async ({
  senderId,
  category,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) => {
  const filter = {};
  if (senderId) filter.sender = senderId;
  if (category) filter.category = category;
  if (fromDate || toDate) {
    filter.sentAt = {};
    if (fromDate) filter.sentAt.$gte = new Date(fromDate);
    if (toDate) filter.sentAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Notification.find(filter)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", SENDER_PROJECTION)
      .populate("template", { name: 1, category: 1 }),
    Notification.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const notif = await Notification.findById(id)
    .populate("sender", SENDER_PROJECTION)
    .populate("template", { name: 1, body: 1, category: 1 })
    .populate("audience.groupIds", { name: 1 })
    .populate("audience.userIds", { firstName: 1, lastName: 1, role: 1 })
    .populate("relatedFeedback", { message: 1, status: 1 });
  if (!notif) throw new ApiError(404, "Xabar topilmadi");
  return notif;
};

export const getRecipientList = async (notifId, { page = 1, limit = 50 }) => {
  const filter = { notification: notifId };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    NotificationRecipient.find(filter)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate("user", { firstName: 1, lastName: 1, phone: 1, role: 1 }),
    NotificationRecipient.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getMyInbox = async (
  userId,
  { page = 1, limit = 20, unreadOnly = false } = {},
) => {
  const filter = { user: userId };
  if (unreadOnly) filter.readAt = null;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    NotificationRecipient.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "notification",
        populate: { path: "sender", select: SENDER_PROJECTION },
      }),
    NotificationRecipient.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getUnreadCount = async (userId) =>
  NotificationRecipient.countDocuments({ user: userId, readAt: null });

export const markRead = async (recipientId, userId) => {
  const updated = await NotificationRecipient.findOneAndUpdate(
    { _id: recipientId, user: userId, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  if (updated) {
    await Notification.updateOne(
      { _id: updated.notification },
      { $inc: { readCount: 1 } },
    );
  }
  return updated;
};

export const markAllRead = async (userId) => {
  const docs = await NotificationRecipient.find(
    { user: userId, readAt: null },
    { _id: 1, notification: 1 },
  );
  if (!docs.length) return { updated: 0 };

  await NotificationRecipient.updateMany(
    { user: userId, readAt: null },
    { $set: { readAt: new Date() } },
  );

  // Notification.readCount inkrement (bulk)
  const counts = new Map();
  for (const d of docs) {
    const k = String(d.notification);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  await Promise.all(
    [...counts.entries()].map(([nid, cnt]) =>
      Notification.updateOne({ _id: nid }, { $inc: { readCount: cnt } }),
    ),
  );

  return { updated: docs.length };
};

export const getStats = async ({ fromDate, toDate } = {}) => {
  const range = {};
  if (fromDate || toDate) {
    range.sentAt = {};
    if (fromDate) range.sentAt.$gte = new Date(fromDate);
    if (toDate) range.sentAt.$lte = new Date(toDate);
  }

  const [total, byCategory, totals] = await Promise.all([
    Notification.countDocuments(range),
    Notification.aggregate([
      { $match: range },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          recipients: { $sum: "$recipientsCount" },
          delivered: { $sum: "$deliveredViaBot" },
          reads: { $sum: "$readCount" },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Notification.aggregate([
      { $match: range },
      {
        $group: {
          _id: null,
          totalRecipients: { $sum: "$recipientsCount" },
          totalDelivered: { $sum: "$deliveredViaBot" },
          totalReads: { $sum: "$readCount" },
        },
      },
    ]),
  ]);

  const t = totals[0] || {
    totalRecipients: 0,
    totalDelivered: 0,
    totalReads: 0,
  };
  const readRate =
    t.totalRecipients > 0
      ? Math.round((t.totalReads / t.totalRecipients) * 100)
      : 0;

  return {
    total,
    totalRecipients: t.totalRecipients,
    totalDelivered: t.totalDelivered,
    totalReads: t.totalReads,
    readRate,
    byCategory,
  };
};

// Feedback statusi o'zgarganda avto-notification (faqat anonim emas bo'lsa)
export const notifyFeedbackStatusChange = async (
  feedback,
  { statusLabel, adminReply, rejectionReason },
  currentUser,
) => {
  if (!feedback?.author || feedback.isAnonymous) return null;

  const lines = [`Sizning feedback'ingiz holati: ${statusLabel}`];
  if (adminReply) lines.push(`Javob: ${adminReply}`);
  if (rejectionReason) lines.push(`Sabab: ${rejectionReason}`);
  const body = lines.join("\n");

  return send(
    {
      title: "Feedback holati o'zgardi",
      body,
      category: "feedback_status",
      audience: {
        type: "feedback_author",
        userIds: [feedback.author],
      },
      relatedFeedback: feedback._id,
      isAuto: true,
    },
    currentUser,
  );
};
