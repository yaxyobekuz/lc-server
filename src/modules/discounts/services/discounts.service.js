import Discount from "../../../models/discount.model.js";
import DiscountKind from "../../../models/discountKind.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";

const ensureStudent = async (studentId) => {
  const u = await User.findById(studentId);
  if (!u || u.role !== ROLES.STUDENT) {
    throw new ApiError(400, "Talaba topilmadi");
  }
  return u;
};

const ensureKind = async (kindId) => {
  const k = await DiscountKind.findById(kindId);
  if (!k) throw new ApiError(400, "Chegirma turi topilmadi");
  return k;
};

export const list = async ({
  studentId,
  isActive,
  page = 1,
  limit = 50,
}) => {
  const filter = {};
  if (studentId) filter.student = studentId;
  if (isActive !== undefined) filter.isActive = !!isActive;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Discount.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("kind", { name: 1, isActive: 1 }),
    Discount.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const create = async (body) => {
  await ensureStudent(body.student);
  await ensureKind(body.kind);

  if (body.valueType === "percent" && (body.value < 0 || body.value > 100)) {
    throw new ApiError(400, "Foiz 0 dan 100 gacha bo'lishi kerak");
  }
  if (body.value < 0) throw new ApiError(400, "Qiymat manfiy bo'lmasin");

  const doc = {
    student: body.student,
    kind: body.kind,
    valueType: body.valueType,
    value: body.value,
    reason: body.reason || "",
    startDate: body.startDate ? new Date(body.startDate) : new Date(),
    endDate: body.endDate ? new Date(body.endDate) : null,
    isActive: body.isActive !== undefined ? !!body.isActive : true,
  };
  return Discount.create(doc);
};

export const getById = async (id) => {
  const doc = await Discount.findById(id).populate("kind");
  if (!doc) throw new ApiError(404, "Chegirma topilmadi");
  return doc;
};

export const update = async (id, body) => {
  const doc = await getById(id);

  if (body.kind !== undefined) {
    await ensureKind(body.kind);
    doc.kind = body.kind;
  }
  if (body.valueType !== undefined) doc.valueType = body.valueType;
  if (body.value !== undefined) {
    if (body.value < 0) throw new ApiError(400, "Qiymat manfiy bo'lmasin");
    if (doc.valueType === "percent" && body.value > 100) {
      throw new ApiError(400, "Foiz 100 dan oshmasin");
    }
    doc.value = body.value;
  }
  if (body.reason !== undefined) doc.reason = body.reason;
  if (body.startDate !== undefined) {
    doc.startDate = body.startDate ? new Date(body.startDate) : new Date();
  }
  if (body.endDate !== undefined) {
    doc.endDate = body.endDate ? new Date(body.endDate) : null;
  }
  if (body.isActive !== undefined) doc.isActive = !!body.isActive;

  await doc.save();
  return doc;
};

export const remove = async (id) => {
  const doc = await getById(id);
  await doc.deleteOne();
  return doc;
};

// Faqat shu ondagi active chegirmalarni qaytaradi (billing helper foydalanadi)
export const getActiveForStudent = async (studentId, asOf = new Date()) => {
  const docs = await Discount.find({
    student: studentId,
    isActive: true,
    startDate: { $lte: asOf },
    $or: [{ endDate: null }, { endDate: { $gte: asOf } }],
  }).populate("kind", { name: 1 });
  return docs;
};
