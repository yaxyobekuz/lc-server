import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

export const LEFT_REASONS = ["transferred", "removed", "graduated"];

const groupMembershipSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    // Statik tur: guruh oqimi mantiqi uchun (transfer/chiqarish/bitirish).
    leftReason: { type: String, enum: LEFT_REASONS, default: null },
    // Dinamik "nega chiqdi" sababi (owner boshqaradigan ArchiveReason).
    // leftReason "removed" bo'lganda to'ldiriladi - retention tahlili shu bo'yicha.
    leftReasonDetail: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArchiveReason",
      default: null,
      index: true,
    },
    // Sabab keyin o'zgarsa/o'chsa ham hisobot buzilmasligi uchun snapshot.
    leftReasonTitle: { type: String, default: "" },
    // O'quvchi guruhdan chiqarilganda login qilganda bir marta "siz {guruh}dan
    // chiqarildingiz" modali ko'rsatiladi. Modal yopilgach bu sana to'ldiriladi
    // va modal qayta ko'rinmaydi (faqat leftReason="removed" uchun ahamiyatli).
    removalNoticeSeenAt: { type: Date, default: null },
    transferredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
  },
  { timestamps: true },
);

// Bir vaqtda bir (group, student) juftligi uchun faqat bitta FAOL (active) membership.
// MUHIM: soft-delete qilingan (isDeleted=true) yozuvlar slotni band qilmasligi kerak -
// aks holda eski "o'chirilgan" a'zolik tufayli o'quvchini qayta qo'shib/ko'chirib bo'lmaydi
// (E11000 yoki "allaqachon shu guruhda" xatosi chiqib, o'quvchi guruhda ko'rinmay qoladi).
groupMembershipSchema.index(
  { group: 1, student: 1 },
  {
    unique: true,
    partialFilterExpression: { leftAt: null, isDeleted: false },
  },
);

groupMembershipSchema.plugin(softDeletePlugin);

const GroupMembership = mongoose.model("GroupMembership", groupMembershipSchema);

export default GroupMembership;
