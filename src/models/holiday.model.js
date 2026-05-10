import mongoose from "mongoose";

export const HOLIDAY_AUDIENCES = ["all", "students", "teachers"];

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    isRecurring: { type: Boolean, default: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    day: { type: Number, required: true, min: 1, max: 31 },
    year: { type: Number, default: null }, // faqat isRecurring=false bo'lsa
    message: { type: String, required: true },
    audience: {
      type: String,
      enum: HOLIDAY_AUDIENCES,
      default: "all",
    },
    isActive: { type: Boolean, default: true, index: true },
    lastSentAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

holidaySchema.index({ isActive: 1, month: 1, day: 1 });

holidaySchema.pre("validate", function (next) {
  if (!this.isRecurring && !this.year) {
    return next(new Error("Bir martalik bayram uchun yil ko'rsatilishi kerak"));
  }
  if (this.isRecurring) {
    this.year = null;
  }
  next();
});

holidaySchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Holiday = mongoose.model("Holiday", holidaySchema);

export default Holiday;
