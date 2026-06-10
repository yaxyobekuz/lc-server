import mongoose from "mongoose";
import Notification from "../../../models/notification.model.js";
import NotificationRecipient from "../../../models/notificationRecipient.model.js";
import NotificationTemplate from "../../../models/notificationTemplate.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import BotUser from "../../../models/botUser.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import {
  personalizeManyForUser,
  personalizeBulk,
} from "./personalizeBody.helper.js";

// Bir vaqtning o'zida nechta bot xabari yuborilsin (Telegram ~30/sek global limit)
const DELIVERY_CONCURRENCY = 20;

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
    { teachers: teacherId, isActive: true, isDeleted: { $ne: true } },
    { _id: 1 },
  );
  return groups.map((g) => g._id);
};

// Bitta o'qituvchining barcha active o'quvchilari ID'larini qaytaradi
const getTeacherStudentIds = async (teacherId) => {
  const groupIds = await getTeacherGroupIds(teacherId);
  if (!groupIds.length) return [];
  const memberships = await GroupMembership.find(
    { group: { $in: groupIds }, leftAt: null, isDeleted: { $ne: true } },
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
      "O'qituvchi faqat o'z guruhlari yoki o'quvchilariga xabar yubora oladi",
    );
  }

  let recipientIds = [];

  switch (audience.type) {
    case "all_students": {
      if (!isOwner && !isSystem) {
        throw new ApiError(403, "Ruxsat yo'q");
      }
      const users = await User.find(
        { role: ROLES.STUDENT, isActive: true, isDeleted: { $ne: true } },
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
        { role: ROLES.TEACHER, isActive: true, isDeleted: { $ne: true } },
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
        { group: { $in: groupIds }, leftAt: null, isDeleted: { $ne: true } },
        { student: 1 },
      );
      const studentIds = [...new Set(memberships.map((m) => String(m.student)))];
      // Boshqa branchlar kabi - faqat aktiv, o'chirilmagan o'quvchilar.
      const activeStudents = await User.find(
        { _id: { $in: studentIds }, isActive: true, isDeleted: { $ne: true } },
        { _id: 1 },
      );
      recipientIds = activeStudents.map((u) => u._id);
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
        // Teacher faqat o'z guruhi o'quvchilari
        const myStudents = new Set(await getTeacherStudentIds(currentUser._id));
        const allMine = userIds.every((id) => myStudents.has(id));
        if (!allMine) {
          throw new ApiError(
            403,
            "Faqat o'z guruh o'quvchilaringizga yubora olasiz",
          );
        }
      }
      const users = await User.find(
        { _id: { $in: userIds }, isActive: true, isDeleted: { $ne: true } },
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    case "auto_system": {
      // Auto job userIds beradi - boshqa branchlar kabi aktiv foydalanuvchilarga filtrlaymiz
      const ids = (audience.userIds || []).map(String);
      if (ids.length === 0) {
        recipientIds = [];
        break;
      }
      const users = await User.find(
        { _id: { $in: ids }, isActive: true, isDeleted: { $ne: true } },
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    default:
      throw new ApiError(400, "Noto'g'ri audience turi");
  }

  // Deduplicate
  const uniqueSet = new Set(recipientIds.map(String));
  return [...uniqueSet].map((id) => new mongoose.Types.ObjectId(id));
};

// Jonli preview: tanlangan auditoriya bo'yicha nechta oluvchi chiqishini
// hisoblaydi (xabar yaratmasdan). Wizard'da "N ta foydalanuvchiga boradi".
export const previewAudience = async (audience, currentUser) => {
  const recipientIds = await resolveAudience(audience, currentUser);
  return { count: recipientIds.length };
};

// Cheklangan parallellik bilan ishlovchi pool (tashqi kutubxonasiz)
const runPool = async (items, concurrency, worker) => {
  let idx = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length) {
        const cur = idx;
        idx += 1;
        await worker(items[cur]);
      }
    },
  );
  await Promise.all(runners);
};

// Bot push - yetkazilmagan oluvchilarga partiyalab, cheklangan parallellik bilan.
// Idempotent: faqat botDeliveredAt=null bo'lganlarni qayta uradi (job retry xavfsiz).
export const deliverNotification = async (notificationId) => {
  const notif = await Notification.findById(notificationId).lean();
  if (!notif) return;

  // Telegram kanali tanlanmagan bo'lsa - bot push qilinmaydi (faqat in-app).
  const channels = notif.channels?.length ? notif.channels : ["inapp", "telegram"];
  if (!channels.includes("telegram")) return;

  const recipients = await NotificationRecipient.find({
    notification: notificationId,
    botDeliveredAt: null,
  })
    .select("_id user")
    .lean();
  if (recipients.length === 0) return;

  // Barcha BotUser'larni BITTA so'rovda olamiz (N+1 yo'q)
  const userIds = recipients.map((r) => r.user);
  const botUsers = await BotUser.find(
    { user: { $in: userIds } },
    { user: 1, chatId: 1, telegramId: 1, isBlocked: 1 },
  ).lean();
  const buByUser = new Map(botUsers.map((b) => [String(b.user), b]));

  const { deliverToChat } = await import(
    "../../../bot/services/notificationDeliver.service.js"
  );

  // {ism}, {familiya}, {guruh}, {markaz}'ni har bir oluvchi uchun almashtiramiz.
  // Token bo'lmasa - barcha uchun bir xil matn (qo'shimcha so'rovsiz).
  const bodyByUser = await personalizeBulk(notif.body, userIds);

  let delivered = 0;
  const ops = [];
  await runPool(recipients, DELIVERY_CONCURRENCY, async (r) => {
    const bu = buByUser.get(String(r.user));
    if (!bu || bu.isBlocked || !bu.chatId) {
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { botFailedReason: "no-bot-link" } },
        },
      });
      return;
    }
    const res = await deliverToChat(
      { chatId: bu.chatId, telegramId: bu.telegramId },
      {
        title: notif.title,
        body: bodyByUser.get(String(r.user)) ?? notif.body,
        category: notif.category,
      },
    );
    if (res.ok) {
      delivered += 1;
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { botDeliveredAt: new Date(), botFailedReason: null } },
        },
      });
    } else if (!res.transient) {
      // transient (bot-not-running / 429) - terminal sifatida saqlamaymiz, keyin retry bo'ladi
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { botFailedReason: res.reason } },
        },
      });
    }
  });

  if (ops.length) await NotificationRecipient.bulkWrite(ops, { ordered: false });
  if (delivered > 0) {
    await Notification.updateOne(
      { _id: notificationId },
      { $inc: { deliveredViaBot: delivered } },
    );
  }
};

// Yetkazishni so'rov oqimidan ajratamiz: Agenda job'iga qo'yamiz.
// Agenda mavjud bo'lmasa (mas. test) - fonда (detached) bajaramiz.
const scheduleDelivery = async (notificationId) => {
  try {
    const agenda = (await import("../../../config/agenda.js")).default;
    await agenda.now("notification.deliver", {
      notificationId: String(notificationId),
    });
  } catch (err) {
    logger.warn({ err }, "Yetkazish job'i navbatga qo'yilmadi, inline bajariladi");
    deliverNotification(notificationId).catch((e) =>
      logger.error({ err: e, notificationId }, "Inline yetkazish xato"),
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

  // Idempotentlik: dedupeKey berilsa va shunday xabar mavjud bo'lsa - qayta yaratmaymiz
  // (avto job'lar/qayta-urinishlar dublikat bildirishnoma yaratmasligi uchun)
  if (body.dedupeKey) {
    const existing = await Notification.findOne({ dedupeKey: body.dedupeKey });
    if (existing) return existing;
  }

  const senderRole = currentUser
    ? currentUser.role === ROLES.OWNER
      ? "owner"
      : "teacher"
    : "system";

  // Kanallar - kamida bittasi (validator min(1)). Berilmasa eski xulq: ikkalasi.
  const channels =
    body.channels?.length ? [...new Set(body.channels)] : ["inapp", "telegram"];

  // Rejalashtirish: scheduleAt kelajakda bo'lsa - hoziroq yubormaymiz.
  const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : null;
  const isScheduled = scheduleAt && scheduleAt.getTime() > Date.now() + 30 * 1000;

  // 1) Notification hujjatini yaratamiz (recipient'larsiz, status'ga qarab).
  const notification = await Notification.create({
    sender: currentUser?._id || null,
    senderRole,
    title: body.title || "",
    body: finalBody,
    category: finalCategory,
    template: templateRef,
    audience: body.audience,
    channels,
    status: isScheduled ? "scheduled" : "sent",
    scheduleAt: isScheduled ? scheduleAt : null,
    recipientsCount: recipientIds.length, // preview snapshot
    deliveredViaBot: 0,
    readCount: 0,
    isAuto: !!body.isAuto,
    dedupeKey: body.dedupeKey || null,
    relatedFeedback: body.relatedFeedback || null,
    sentAt: isScheduled ? scheduleAt : new Date(),
  });

  if (isScheduled) {
    // Recipient'lar va bot push job ishga tushganda materializatsiya qilinadi
    // (shu vaqtga qadar auditoriya o'zgargan bo'lsa - eng so'nggi holat olinadi).
    await scheduleSend(notification._id, scheduleAt);
    return notification;
  }

  // Darhol yuborish - recipient'larni yaratamiz va bot push'ni navbatga qo'yamiz.
  await materializeRecipients(notification._id, recipientIds, channels);
  return Notification.findById(notification._id);
};

// Notification uchun recipient hujjatlarini yaratadi va (telegram tanlangan bo'lsa)
// bot yetkazishni navbatga qo'yadi. Darhol va rejalashtirilgan yuborish - ikkovi ham
// shu funksiyani chaqiradi. Idempotent emas: bir marta chaqirilishi ko'zda tutilgan.
const materializeRecipients = async (notificationId, recipientIds, channels) => {
  const wantsInapp = channels.includes("inapp");
  if (recipientIds.length > 0) {
    const docs = recipientIds.map((uid) => ({
      notification: notificationId,
      user: uid,
      inapp: wantsInapp,
      readAt: null,
    }));
    await NotificationRecipient.insertMany(docs, { ordered: false });
  }

  if (recipientIds.length > 0 && channels.includes("telegram")) {
    await scheduleDelivery(notificationId);
  }
};

// Rejalashtirilgan yuborishni belgilangan vaqtga Agenda job'iga qo'yadi.
const scheduleSend = async (notificationId, when) => {
  try {
    const agenda = (await import("../../../config/agenda.js")).default;
    await agenda.schedule(when, "notification.send", {
      notificationId: String(notificationId),
    });
  } catch (err) {
    logger.error(
      { err, notificationId, when },
      "Rejalashtirilgan yuborish job'i qo'yilmadi",
    );
    throw new ApiError(500, "Xabarni rejalashtirib bo'lmadi");
  }
};

// Rejalashtirilgan yuborish vaqti kelganda Agenda job tomonidan chaqiriladi:
// auditoriyani QAYTA hisoblaydi (eng so'nggi holat), recipient'larni yaratadi,
// holatni "sent" ga o'tkazadi va bot push'ni navbatga qo'yadi. Idempotent -
// status allaqachon "sent" bo'lsa hech nima qilmaydi.
export const dispatchScheduled = async (notificationId) => {
  const notif = await Notification.findById(notificationId);
  if (!notif || notif.status !== "scheduled") return;

  const sender = notif.sender
    ? { _id: notif.sender, role: notif.senderRole === "owner" ? ROLES.OWNER : ROLES.TEACHER }
    : null;
  const recipientIds = await resolveAudience(notif.audience, sender);

  const channels = notif.channels?.length ? notif.channels : ["inapp", "telegram"];
  await Notification.updateOne(
    { _id: notif._id, status: "scheduled" },
    { $set: { status: "sent", sentAt: new Date(), recipientsCount: recipientIds.length } },
  );
  await materializeRecipients(notif._id, recipientIds, channels);
};

// Rejalashtirilgan xabarni bekor qilish (hali yuborilmagan bo'lsa).
export const cancelScheduled = async (notificationId) => {
  const notif = await Notification.findById(notificationId);
  if (!notif) throw new ApiError(404, "Xabar topilmadi");
  if (notif.status !== "scheduled") {
    throw new ApiError(400, "Faqat rejalashtirilgan xabarni bekor qilish mumkin");
  }
  notif.status = "canceled";
  await notif.save();
  try {
    const agenda = (await import("../../../config/agenda.js")).default;
    await agenda.cancel({
      name: "notification.send",
      "data.notificationId": String(notificationId),
    });
  } catch (err) {
    logger.warn({ err, notificationId }, "Reja job'ini bekor qilishda xato");
  }
  return notif;
};

export const list = async ({
  senderId,
  category,
  channel,
  status,
  search,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) => {
  const filter = {};
  if (senderId) filter.sender = senderId;
  if (category) filter.category = category;
  if (channel) filter.channels = channel;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { body: rx }];
  }
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
  // Faqat in-app kanali tanlangan xabarlar inbox'da ko'rinadi
  // (eski yozuvlarda inapp maydoni yo'q - ularni ham ko'rsatamiz).
  const filter = { user: userId, inapp: { $ne: false } };
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

  // O'zgaruvchilarni ({ism}, {familiya}, {guruh}, {markaz}) shu o'quvchi uchun
  // almashtiramiz. Ism/guruh BIR MARTA yechiladi (barcha xabarlar bitta userники).
  const withBody = items.filter((it) => it.notification?.body);
  if (withBody.length) {
    const bodies = withBody.map((it) => it.notification.body);
    const personalized = await personalizeManyForUser(bodies, userId);
    withBody.forEach((it, i) => {
      it.notification.body = personalized[i];
    });
  }

  return { items, total, page, limit };
};

export const getUnreadCount = async (userId) =>
  NotificationRecipient.countDocuments({
    user: userId,
    readAt: null,
    inapp: { $ne: false },
  });

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
  // Faqat in-app kanalidagi xabarlarni "o'qildi" qilamiz - getMyInbox va
  // getUnreadCount bilan bir xil qamrov (telegram-only recipientlar inbox'da
  // ko'rinmaydi, shuning uchun ularning readCount'iga ham tegmaymiz).
  const docs = await NotificationRecipient.find(
    { user: userId, readAt: null, inapp: { $ne: false } },
    { _id: 1, notification: 1 },
  ).lean();
  if (!docs.length) return { updated: 0 };

  // Har bir notification bo'yicha recipient id'larini guruhlaymiz, so'ng
  // ATOMIK updateMany qilib FAQAT shu chaqiruvda haqiqatan o'zgargan sonni
  // (modifiedCount) readCount'ga qo'shamiz - bir vaqtda kelgan markRead bilan
  // ikki marta sanash poygasini oldini oladi.
  const byNotif = new Map();
  for (const d of docs) {
    const k = String(d.notification);
    if (!byNotif.has(k)) byNotif.set(k, []);
    byNotif.get(k).push(d._id);
  }

  const now = new Date();
  const results = await Promise.all(
    [...byNotif.entries()].map(async ([nid, ids]) => {
      const res = await NotificationRecipient.updateMany(
        { _id: { $in: ids }, readAt: null },
        { $set: { readAt: now } },
      );
      const n = res.modifiedCount || 0;
      if (n > 0) {
        await Notification.updateOne({ _id: nid }, { $inc: { readCount: n } });
      }
      return n;
    }),
  );

  return { updated: results.reduce((a, b) => a + b, 0) };
};

export const getStats = async ({ fromDate, toDate } = {}) => {
  // Faqat haqiqatan yuborilgan xabarlar statistikaga kiradi.
  // scheduled (hali yuborilmagan, recipientsCount faqat preview) va canceled
  // (umuman yetkazilmagan) yozuvlar totalRecipients va readRate'ni buzadi.
  const range = { status: "sent" };
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
