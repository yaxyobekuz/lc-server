import mongoose from "mongoose";
import { LEAD_OPTION_KINDS } from "../constants/leadStatus.js";

// Lid sozlamalari: Manba / Yo'nalish / Rad etish sababi - faqat nom
const leadOptionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: LEAD_OPTION_KINDS, required: true },
    name: { type: String, trim: true, required: true },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

leadOptionSchema.index({ kind: 1, isActive: 1 });

leadOptionSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const LeadOption = mongoose.model("LeadOption", leadOptionSchema);

export default LeadOption;
