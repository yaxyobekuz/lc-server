import mongoose from "mongoose";

export const EXPENSE_CATEGORIES = [
  "salary",
  "rent",
  "utility",
  "ads",
  "other",
];

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: EXPENSE_CATEGORIES,
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, default: Date.now },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1, date: -1 });

expenseSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Expense = mongoose.model("Expense", expenseSchema);

export default Expense;
