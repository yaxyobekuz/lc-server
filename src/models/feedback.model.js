import mongoose from "mongoose";

export const FEEDBACK_STATUSES = ["new", "in_review", "resolved", "rejected"];

const feedbackSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    authorRoleSnapshot: { type: String, default: "" },
    isAnonymous: { type: Boolean, default: false },
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeedbackType",
      required: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    message: {
      type: String,
      required: true,
      minlength: 5,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: FEEDBACK_STATUSES,
      default: "new",
      index: true,
    },
    rejectionReason: { type: String, default: "" },
    adminReply: { type: String, default: "" },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    repliedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ author: 1, createdAt: -1 });
feedbackSchema.index({ type: 1 });

feedbackSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Feedback = mongoose.model("Feedback", feedbackSchema);

export default Feedback;
