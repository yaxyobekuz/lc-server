import ActivityLog from "../../../models/activityLog.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";

const USER_PROJECTION = { firstName: 1, lastName: 1, role: 1, username: 1 };

export const list = async ({
  userId,
  method,
  resourceType,
  fromDate,
  toDate,
  page = 1,
  limit = 30,
}) => {
  const filter = {};
  if (userId) filter.user = userId;
  if (method) filter.method = method;
  if (resourceType) filter.resourceType = resourceType;
  if (fromDate || toDate) {
    filter.createdAt = {};
    if (fromDate) filter.createdAt.$gte = new Date(fromDate);
    if (toDate) filter.createdAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", USER_PROJECTION),
    ActivityLog.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await ActivityLog.findById(id).populate("user", USER_PROJECTION);
  if (!doc) throw new ApiError(404, "Log topilmadi");
  return doc;
};

export const getStats = async ({ fromDate, toDate } = {}) => {
  const match = {};
  if (fromDate || toDate) {
    match.createdAt = {};
    if (fromDate) match.createdAt.$gte = new Date(fromDate);
    if (toDate) match.createdAt.$lte = new Date(toDate);
  }

  const [total, byMethod, byResource, topUsers] = await Promise.all([
    ActivityLog.countDocuments(match),
    ActivityLog.aggregate([
      { $match: match },
      { $group: { _id: "$method", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ActivityLog.aggregate([
      { $match: match },
      { $group: { _id: "$resourceType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    ActivityLog.aggregate([
      { $match: { ...match, user: { $ne: null } } },
      { $group: { _id: "$user", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: User.collection.name,
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          firstName: "$user.firstName",
          lastName: "$user.lastName",
          role: "$user.role",
          count: 1,
        },
      },
    ]),
  ]);

  return { total, byMethod, byResource, topUsers };
};
