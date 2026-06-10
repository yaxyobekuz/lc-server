import mongoose from "mongoose";

const archiveReasonSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

archiveReasonSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const ArchiveReason = mongoose.model("ArchiveReason", archiveReasonSchema);

export default ArchiveReason;
