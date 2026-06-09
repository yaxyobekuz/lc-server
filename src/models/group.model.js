import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleItemSchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS, required: true },
    startTime: {
      type: String,
      required: true,
      match: [TIME_REGEX, "Vaqt formati noto'g'ri (HH:mm)"],
    },
    endTime: {
      type: String,
      required: true,
      match: [TIME_REGEX, "Vaqt formati noto'g'ri (HH:mm)"],
    },
  },
  { _id: false },
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    schedule: { type: [scheduleItemSchema], default: [] },
    teachers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    ],
    // Dars boshlanish sanasi — undan oldin davomat hisoblanmaydi.
    startDate: { type: Date, default: null },
    // Kurs davomiyligi (oy) — ma'lumot uchun (mas. 10 oylik / 12 oylik).
    durationMonths: { type: Number, default: null, min: 0 },
    // Kurs holati. "finished" → davomat to'xtaydi (finishedAt'dan keyin).
    status: { type: String, enum: ["active", "finished"], default: "active", index: true },
    finishedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

groupSchema.index({ name: 1 });

const DAY_LABELS_UZ = {
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
};

groupSchema.pre("validate", function (next) {
  // Bir kunda bir nechta dars (sessiya) bo'lishi mumkin, lekin bir xil
  // (kun + boshlanish vaqti) takrorlanmasligi kerak.
  const seen = new Set();
  for (const item of this.schedule || []) {
    const key = `${item.day}-${item.startTime}`;
    if (seen.has(key)) {
      const label = DAY_LABELS_UZ[item.day] || item.day;
      return next(
        new Error(
          `Bir xil dars vaqti takrorlanmasligi kerak (${label} ${item.startTime})`,
        ),
      );
    }
    seen.add(key);
    if (item.startTime >= item.endTime) {
      return next(
        new Error(`Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak (${item.day})`),
      );
    }
  }
  next();
});

groupSchema.plugin(softDeletePlugin);

const Group = mongoose.model("Group", groupSchema);

export const GROUP_DAYS = DAYS;
export default Group;
