import mongoose from "mongoose";

const leadDirectionSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Faqat active yo'nalishlar orasida nom unique
leadDirectionSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

leadDirectionSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const LeadDirection = mongoose.model("LeadDirection", leadDirectionSchema);

export default LeadDirection;
