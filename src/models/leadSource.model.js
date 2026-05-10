import mongoose from "mongoose";

const leadSourceSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Faqat active manbalar orasida nom unique bo'lishi uchun partial index
leadSourceSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

leadSourceSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const LeadSource = mongoose.model("LeadSource", leadSourceSchema);

export default LeadSource;
