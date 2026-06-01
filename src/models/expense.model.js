import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

const expenseSchema = new mongoose.Schema(
  {
    // Dinamik xarajat turi (ExpenseType lug'atiga havola)
    type: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseType",
      required: true,
      index: true,
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

expenseSchema.plugin(softDeletePlugin);

expenseSchema.index({ date: -1 });
expenseSchema.index({ type: 1, date: -1 });

expenseSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Expense = mongoose.model("Expense", expenseSchema);

export default Expense;
