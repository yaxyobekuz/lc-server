import mongoose from "mongoose";
import defaultFlagPlugin from "./plugins/defaultFlag.plugin.js";

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const leadStatusSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    color: {
      type: String,
      default: "#6366f1",
      match: [HEX_REGEX, "Rang HEX formatda bo'lishi kerak"],
    },
    order: { type: Number, default: 0 },
    isInitial: { type: Boolean, default: false },
    isFinal: { type: Boolean, default: false },
    isConverted: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

leadStatusSchema.plugin(defaultFlagPlugin);

leadStatusSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);
leadStatusSchema.index({ order: 1 });

leadStatusSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const LeadStatus = mongoose.model("LeadStatus", leadStatusSchema);

export default LeadStatus;
