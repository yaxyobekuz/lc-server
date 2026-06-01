import mongoose from "mongoose";
import defaultFlagPlugin from "./plugins/defaultFlag.plugin.js";

const leadSourceSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

leadSourceSchema.plugin(defaultFlagPlugin);

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
