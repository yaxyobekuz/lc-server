import Discount from "../../../models/discount.model.js";
import DiscountKind from "../../../models/discountKind.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  ensureActiveGroup,
  isActiveInGroup,
} from "../../../helpers/membership.helper.js";

const ensureStudent = async (studentId) => {
  const u = await User.findById(studentId);
  if (!u || u.role !== ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchi topilmadi");
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
  const filter = { isDeleted: { $ne: true } };
  if (studentId) filter.student = studentId;
  if (isActive !== undefined) filter.isActive = !!isActive;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Discount.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("kind", { name: 1, isActive: 1 })
      .populate("group", { name: 1 }),
    Discount.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const create = async (body) => {
  await ensureStudent(body.student);
  await ensureActiveGroup(body.student);
  await ensureKind(body.kind);

  // Guruhga xos chegirma — o'quvchi o'sha guruhda faol bo'lishi shart (null = barchasi)
  const group = body.group || null;
  if (group && !(await isActiveInGroup(body.student, group))) {
    throw new ApiError(400, "O'quvchi bu guruhda o'qimaydi");
  }

  if (body.valueType === "percent" && (body.value < 0 || body.value > 100)) {
    throw new ApiError(400, "Foiz 0 dan 100 gacha bo'lishi kerak");
  }
  if (body.value < 0) throw new ApiError(400, "Qiymat manfiy bo'lmasin");

  const startDate = body.startDate ? new Date(body.startDate) : new Date();
  const endDate = body.endDate ? new Date(body.endDate) : null;

  // Boshlanish sanasi bugundan oldin bo'lishi mumkin emas
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  if (startDate < startOfToday) {
    throw new ApiError(400, "Boshlanish sanasi bugundan oldin bo'lishi mumkin emas");
  }
  // endDate berilsa, boshlanishdan oldin bo'lmasligi kerak (null — muddatsiz/cheksiz)
  if (endDate && endDate < startDate) {
    throw new ApiError(400, "Tugash sanasi boshlanish sanasidan oldin bo'lmasin");
  }

  const doc = {
    student: body.student,
    group,
    kind: body.kind,
    valueType: body.valueType,
    value: body.value,
    reason: body.reason || "",
    startDate,
    endDate,
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
  if (body.group !== undefined) {
    const group = body.group || null;
    if (group && !(await isActiveInGroup(doc.student, group))) {
      throw new ApiError(400, "O'quvchi bu guruhda o'qimaydi");
    }
    doc.group = group;
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
  await doc.softDelete();
  return doc;
};

// Faqat shu ondagi active chegirmalarni qaytaradi (billing helper foydalanadi).
// groupId berilsa: global (group=null) + shu guruhga xos chegirmalar; aks holda barchasi.
export const getActiveForStudent = async (
  studentId,
  asOf = new Date(),
  groupId,
) => {
  const timeOr = [{ endDate: null }, { endDate: { $gte: asOf } }];
  const filter = {
    student: studentId,
    isActive: true,
    isDeleted: { $ne: true },
    startDate: { $lte: asOf },
  };
  if (groupId) {
    filter.$and = [{ $or: timeOr }, { $or: [{ group: null }, { group: groupId }] }];
  } else {
    filter.$or = timeOr;
  }
  const docs = await Discount.find(filter).populate("kind", { name: 1 });
  return docs;
};
