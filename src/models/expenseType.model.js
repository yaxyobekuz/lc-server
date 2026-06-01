import mongoose from "mongoose";
import defaultFlagPlugin from "./plugins/defaultFlag.plugin.js";

// Migratsiya/seed uchun standart xarajat turlari (eski enum kategoriyalardan ko'chiriladi)
export const DEFAULT_EXPENSE_TYPES = ["Oylik", "Ijara", "Kommunal", "Reklama", "Boshqa"];

const expenseTypeSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

expenseTypeSchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

expenseTypeSchema.plugin(defaultFlagPlugin);

expenseTypeSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const ExpenseType = mongoose.model("ExpenseType", expenseTypeSchema);

export default ExpenseType;
