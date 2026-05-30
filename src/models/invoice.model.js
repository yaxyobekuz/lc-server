import mongoose from "mongoose";

export const INVOICE_STATUSES = ["unpaid", "partial", "paid", "cancelled"];
export const REMINDER_KINDS = ["before", "due", "overdue"];

const reminderSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    kind: { type: String, enum: REMINDER_KINDS, required: true },
  },
  { _id: false },
);

const discountSnapshotSchema = new mongoose.Schema(
  {
    kind: { type: mongoose.Schema.Types.ObjectId, ref: "DiscountKind" },
    value: Number,
    valueType: String,
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    membership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupMembership",
      default: null,
    },
    period: {
      year: { type: Number, required: true },
      month: { type: Number, required: true, min: 1, max: 12 },
    },
    baseAmount: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    discountSnapshot: { type: [discountSnapshotSchema], default: [] },
    totalDue: { type: Number, required: true, min: 0 },
    // Talaba balansidan avtomatik yechilgan summa (paidAmount tarkibida)
    appliedBalance: { type: Number, default: 0, min: 0 },
    // O'qituvchi kelmagan kunlar uchun jami chegirma (totalDue dan ayriladi)
    teacherAbsenceDeduction: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: "unpaid",
      index: true,
    },
    dueDate: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notes: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },
    cancelledReason: { type: String, default: "" },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    remindersSent: { type: [reminderSchema], default: [] },
  },
  { timestamps: true },
);

// Bir oyda bir (student, group) uchun faqat bitta non-cancelled invoice
invoiceSchema.index(
  { student: 1, group: 1, "period.year": 1, "period.month": 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: "cancelled" } },
  },
);
invoiceSchema.index({ status: 1, dueDate: 1 });

invoiceSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Invoice = mongoose.model("Invoice", invoiceSchema);

export default Invoice;
