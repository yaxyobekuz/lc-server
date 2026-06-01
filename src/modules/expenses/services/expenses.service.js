import mongoose from "mongoose";
import Expense from "../../../models/expense.model.js";
import ExpenseType from "../../../models/expenseType.model.js";
import ApiError from "../../../utils/ApiError.js";

const TYPE_PROJECTION = { name: 1, isActive: 1 };

const ensureType = async (typeId) => {
  if (!typeId || !mongoose.isValidObjectId(typeId)) {
    throw new ApiError(400, "Xarajat turi noto'g'ri");
  }
  const t = await ExpenseType.findById(typeId);
  if (!t) throw new ApiError(404, "Xarajat turi topilmadi");
  return t;
};

export const list = async ({
  type,
  fromDate,
  toDate,
  archived = false,
  page = 1,
  limit = 20,
}) => {
  const filter = { isDeleted: archived ? true : { $ne: true } };
  if (type) {
    if (!mongoose.isValidObjectId(type)) {
      throw new ApiError(400, "Xarajat turi noto'g'ri");
    }
    filter.type = type;
  }
  if (fromDate || toDate) {
    filter.date = {};
    if (fromDate) filter.date.$gte = new Date(fromDate);
    if (toDate) filter.date.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("type", TYPE_PROJECTION)
      .populate("createdBy", { firstName: 1, lastName: 1 }),
    Expense.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await Expense.findById(id)
    .populate("type", TYPE_PROJECTION)
    .populate("createdBy", { firstName: 1, lastName: 1 });
  if (!doc) throw new ApiError(404, "Xarajat topilmadi");
  return doc;
};

export const create = async (body, currentUser) => {
  await ensureType(body.type);
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(400, "Summa noto'g'ri");
  }
  return Expense.create({
    type: body.type,
    amount,
    date: body.date ? new Date(body.date) : new Date(),
    description: body.description || "",
    createdBy: currentUser?._id || null,
  });
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.type !== undefined) {
    await ensureType(body.type);
    doc.type = body.type;
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ApiError(400, "Summa noto'g'ri");
    }
    doc.amount = amount;
  }
  if (body.date !== undefined) {
    doc.date = body.date ? new Date(body.date) : new Date();
  }
  if (body.description !== undefined) {
    doc.description = String(body.description);
  }

  await doc.save();
  return getById(doc._id);
};

export const remove = async (id, currentUser) => {
  const doc = await getById(id);
  await doc.softDelete(currentUser?._id);
  return doc;
};

export const restore = async (id) => {
  const doc = await getById(id);
  await doc.restore();
  return getById(doc._id);
};

// Statistika: jami summa, tur bo'yicha, oy bo'yicha trend
export const getStats = async ({ fromDate, toDate } = {}) => {
  const match = { isDeleted: { $ne: true } };
  if (fromDate || toDate) {
    match.date = {};
    if (fromDate) match.date.$gte = new Date(fromDate);
    if (toDate) match.date.$lte = new Date(toDate);
  }

  const [totals, byType] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    Expense.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$type",
          sum: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "expensetypes",
          localField: "_id",
          foreignField: "_id",
          as: "type",
        },
      },
      { $unwind: { path: "$type", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          sum: 1,
          count: 1,
          name: "$type.name",
        },
      },
      { $sort: { sum: -1 } },
    ]),
  ]);

  const t = totals[0] || { total: 0, count: 0 };
  return {
    total: t.total,
    count: t.count,
    byType,
  };
};

// Diapazonda jami xarajat (adminDashboard.getMonthlyFinancials uchun)
export const sumInRange = async (start, end) => {
  const result = await Expense.aggregate([
    { $match: { date: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    { $group: { _id: null, sum: { $sum: "$amount" } } },
  ]);
  return result[0]?.sum || 0;
};
