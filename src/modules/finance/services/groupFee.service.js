import mongoose from "mongoose";
import GroupFee from "../../../models/groupFee.model.js";
import Group from "../../../models/group.model.js";
import ApiError from "../../../utils/ApiError.js";
import { localTodayMidnight } from "../../../helpers/attendance.helper.js";
import * as studentPaymentService from "./studentPayment.service.js";

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

// O'tgan oy to'lovini topadi (carry-forward uchun)
const prevMonthAmount = async (group, year, month) => {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prev = await GroupFee.findOne({ group, year: prevYear, month: prevMonth });
  return prev ? prev.amount : 0;
};

// Guruh+oy uchun to'lov yozuvi mavjudligini ta'minlaydi (carry-forward bilan).
export const ensureGroupFee = async (group, year, month) => {
  const existing = await GroupFee.findOne({ group, year, month });
  if (existing) return existing;
  const amount = await prevMonthAmount(group, year, month);
  try {
    return await GroupFee.findOneAndUpdate(
      { group, year, month },
      { $setOnInsert: { group, year, month, amount, source: "auto" } },
      { upsert: true, new: true },
    );
  } catch (err) {
    if (err?.code === 11000) return GroupFee.findOne({ group, year, month });
    throw err;
  }
};

// Tanlangan oy uchun barcha faol guruhlar + o'sha oy to'lovi (jadval uchun).
export const list = async ({ year, month, search }) => {
  const match = { isActive: true, status: "active", isDeleted: { $ne: true } };
  if (search && search.trim()) {
    match.name = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  const groups = await Group.find(match, { name: 1 }).sort({ name: 1 });

  const fees = await GroupFee.find({
    group: { $in: groups.map((g) => g._id) },
    year: Number(year),
    month: Number(month),
  });
  const byGroup = new Map(fees.map((f) => [String(f.group), f]));

  return groups.map((g) => {
    const fee = byGroup.get(String(g._id));
    return {
      group: { _id: g._id, name: g.name },
      year: Number(year),
      month: Number(month),
      feeId: fee ? fee._id : null,
      amount: fee ? fee.amount : null,
      source: fee ? fee.source : null,
    };
  });
};

// Bitta guruhning barcha oylik to'lovlari (sub-sahifa). Joriy oyni ta'minlaydi.
export const byGroup = async (groupId) => {
  const group = await Group.findById(groupId, { name: 1 });
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  const today = localTodayMidnight();
  await ensureGroupFee(group._id, today.getUTCFullYear(), today.getUTCMonth() + 1);

  const fees = await GroupFee.find({ group: groupId }).sort({ year: -1, month: -1 });
  return { group: { _id: group._id, name: group.name }, fees };
};

// Guruh+oy to'lovini o'rnatadi (upsert). O'chirish yo'q. To'lovlarni qayta hisoblaydi.
export const upsert = async ({ groupId, year, month, amount }, currentUser) => {
  const group = await Group.findById(groupId);
  if (!group) throw new ApiError(404, "Guruh topilmadi");

  const fee = await GroupFee.findOneAndUpdate(
    { group: groupId, year, month },
    {
      $set: { amount, source: "manual", updatedBy: currentUser?._id || null },
      $setOnInsert: { group: groupId, year, month, createdBy: currentUser?._id || null },
    },
    { upsert: true, new: true },
  );

  await studentPaymentService.recalcForGroupMonth(groupId, year, month);
  return fee;
};

// Berilgan oy uchun barcha faol guruhlarga to'lov yozuvini ta'minlaydi (carry-forward).
export const generateMonth = async (year, month) => {
  const groups = await Group.find(
    { isActive: true, status: "active", isDeleted: { $ne: true } },
    { _id: 1 },
  );
  let created = 0;
  for (const g of groups) {
    const existed = await GroupFee.findOne({ group: g._id, year, month });
    if (existed) continue;
    await ensureGroupFee(g._id, year, month);
    created += 1;
  }
  return { groups: groups.length, created };
};
