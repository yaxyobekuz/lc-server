import mongoose from "mongoose";

const salaryPayoutSchema = new mongoose.Schema(
  {
    salary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Salary",
      required: true,
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    method: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentMethod",
      required: true,
    },
    paidAt: { type: Date, default: Date.now },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

salaryPayoutSchema.index({ salary: 1, paidAt: -1 });
salaryPayoutSchema.index({ teacher: 1, paidAt: -1 });

salaryPayoutSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const SalaryPayout = mongoose.model("SalaryPayout", salaryPayoutSchema);

export default SalaryPayout;
