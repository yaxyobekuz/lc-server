import mongoose from "mongoose";

export const ARCHIVE_ACTIONS = ["archive", "restore"];

const archiveLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ARCHIVE_ACTIONS, required: true },
    reason: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ArchiveReason",
      default: null,
    },
    // Sabab keyin o'zgarsa/o'chsa ham hisobot buzilmasligi uchun snapshot
    reasonTitle: { type: String, default: "" },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

archiveLogSchema.index({ reason: 1, action: 1, createdAt: -1 });

archiveLogSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const ArchiveLog = mongoose.model("ArchiveLog", archiveLogSchema);

export default ArchiveLog;
