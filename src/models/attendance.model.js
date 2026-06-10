import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

export const ATTENDANCE_STATUSES = ["present", "absent", "excused", "exempt"];
export const ATTENDANCE_SOURCES = ["teacher", "admin", "auto-exempt"];

const attendanceSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      required: true,
    },
    // Sessiya (kunda bir nechta dars bo'lsa). Bir slotli kun uchun "" (default).
    // Ko'p slotli kunlarda slot = dars boshlanish vaqti (mas. "14:00").
    slot: { type: String, default: "" },
    reason: { type: String, default: "" },
    lateMinutes: { type: Number, default: 0, min: 0 },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recordedAt: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ATTENDANCE_SOURCES,
      default: "teacher",
    },
    // Holat o'zgarishlari tarixi (audit) - kim, qachon, nimadan nimaga o'zgartirdi.
    // O'tmishni keyinroq tahrirlash imkoni borligi uchun manipulyatsiyani kuzatish.
    history: {
      type: [
        new mongoose.Schema(
          {
            at: { type: Date, required: true },
            by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            from: { type: String, default: null },
            to: { type: String, required: true },
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

// Bir (group, student, dateKey, slot) uchun faqat bitta AKTIV yozuv.
// slot - kunda bir nechta sessiya bo'lsa ajratadi (bir slotli kun uchun "").
// Partial: soft-deleted yozuvlar unique cheklovga kirmaydi.
attendanceSchema.index(
  { group: 1, student: 1, dateKey: 1, slot: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
attendanceSchema.index({ student: 1, date: 1 });
attendanceSchema.index({ group: 1, date: 1 });
// O'quvchi bo'yicha dateKey qidiruvi (summary/heatmap hot path) uchun
attendanceSchema.index({ student: 1, dateKey: 1 });

// Kechikdi uchun minut, sababli uchun sabab ixtiyoriy - status o'zi yetarli

attendanceSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

attendanceSchema.plugin(softDeletePlugin);

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
