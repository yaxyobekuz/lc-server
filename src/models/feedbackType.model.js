import mongoose from "mongoose";

const feedbackTypeSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

feedbackTypeSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

feedbackTypeSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const FeedbackType = mongoose.model("FeedbackType", feedbackTypeSchema);

export default FeedbackType;
