import mongoose from "mongoose";

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
    direction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadDirection",
      default: null,
      index: true,
    },
    monthlyPrice: { type: Number, default: 0, min: 0 },
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
  const seen = new Set();
  for (const item of this.schedule || []) {
    if (seen.has(item.day)) {
      const label = DAY_LABELS_UZ[item.day] || item.day;
      return next(
        new Error(`Bir kun jadvalda faqat bir marta bo'lishi mumkin (${label})`),
      );
    }
    seen.add(item.day);
    if (item.startTime >= item.endTime) {
      return next(
        new Error(`Tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak (${item.day})`),
      );
    }
  }
  next();
});

const Group = mongoose.model("Group", groupSchema);

export const GROUP_DAYS = DAYS;
export default Group;
