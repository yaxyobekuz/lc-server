import mongoose from "mongoose";

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
    leftReason: { type: String, enum: LEFT_REASONS, default: null },
    transferredTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
  },
  { timestamps: true },
);

// Bir vaqtda bir (group, student) juftligi uchun faqat bitta active membership
groupMembershipSchema.index(
  { group: 1, student: 1 },
  { unique: true, partialFilterExpression: { leftAt: null } },
);

const GroupMembership = mongoose.model("GroupMembership", groupMembershipSchema);

export default GroupMembership;
