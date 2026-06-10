import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

export const GRADE_MIN = 1;
export const GRADE_MAX = 5;
export const GRADE_SOURCES = ["teacher", "admin"];

// O'quvchining bir dars (sana) uchun 1–5 ballik bahosi. Davomat (attendance)
// modeliga parallel: bir (group, student, dateKey, slot) uchun bitta aktiv baho.
const gradeSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: { type: Date, required: true },
    dateKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak"],
    },
    // Sessiya (kunda bir nechta dars bo'lsa). Bir slotli kun uchun "" (default).
    slot: { type: String, default: "" },
    value: {
      type: Number,
      required: true,
      min: GRADE_MIN,
      max: GRADE_MAX,
    },
    comment: { type: String, default: "" },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recordedAt: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: GRADE_SOURCES,
      default: "teacher",
    },
    // Ball o'zgarishlari tarixi (audit) - kim, qachon, nimadan nimaga.
    history: {
      type: [
        new mongoose.Schema(
          {
            at: { type: Date, required: true },
            by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            from: { type: Number, default: null },
            to: { type: Number, required: true },
            source: { type: String, default: "teacher" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

// Bir (group, student, dateKey, slot) uchun faqat bitta AKTIV baho.
// Partial: soft-deleted yozuvlar unique cheklovga kirmaydi (davomat namunasi).
gradeSchema.index(
  { group: 1, student: 1, dateKey: 1, slot: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
gradeSchema.index({ student: 1, dateKey: 1 });
gradeSchema.index({ group: 1, date: 1 });

gradeSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

gradeSchema.plugin(softDeletePlugin);

const Grade = mongoose.model("Grade", gradeSchema);

export default Grade;
