import Expense, {
  EXPENSE_CATEGORIES,
} from "../../../models/expense.model.js";
import ApiError from "../../../utils/ApiError.js";

const validateCategory = (cat) => {
  if (cat && !EXPENSE_CATEGORIES.includes(cat)) {
    throw new ApiError(400, "Noto'g'ri kategoriya");
  }
};

export const list = async ({
  category,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) => {
  const filter = {};
  if (category) {
    validateCategory(category);
    filter.category = category;
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
      .populate("createdBy", { firstName: 1, lastName: 1 }),
    Expense.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await Expense.findById(id).populate("createdBy", {
    firstName: 1,
    lastName: 1,
  });
  if (!doc) throw new ApiError(404, "Xarajat topilmadi");
  return doc;
};

export const create = async (body, currentUser) => {
  validateCategory(body.category);
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(400, "Summa noto'g'ri");
  }
  return Expense.create({
    category: body.category,
    amount,
    date: body.date ? new Date(body.date) : new Date(),
    description: body.description || "",
    createdBy: currentUser?._id || null,
  });
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.category !== undefined) {
    validateCategory(body.category);
    doc.category = body.category;
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
  return doc;
};

export const remove = async (id) => {
  const doc = await getById(id);
  await doc.deleteOne();
  return doc;
};

// Statistika: jami summa, kategoriya bo'yicha, oy bo'yicha trend
export const getStats = async ({ fromDate, toDate } = {}) => {
  const match = {};
  if (fromDate || toDate) {
    match.date = {};
    if (fromDate) match.date.$gte = new Date(fromDate);
    if (toDate) match.date.$lte = new Date(toDate);
  }

  const [totals, byCategory] = await Promise.all([
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
          _id: "$category",
          sum: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { sum: -1 } },
    ]),
  ]);

  const t = totals[0] || { total: 0, count: 0 };
  return {
    total: t.total,
    count: t.count,
    byCategory,
  };
};

// Diapazonda jami xarajat (adminDashboard.getMonthlyFinancials uchun)
export const sumInRange = async (start, end) => {
  const result = await Expense.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    { $group: { _id: null, sum: { $sum: "$amount" } } },
  ]);
  return result[0]?.sum || 0;
};
