import mongoose from "mongoose";

// Reyting point formulasi vaznlari (yagona-hujjat sozlama).
// point = (o'rtacha_ball / 5 * 100) * gradeWeight + (davomat_foiz) * attendanceWeight
// Ikkala komponent ham 0..100 shkalaga keltiriladi, keyin vaznlanadi.
const ratingSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "default" },
    gradeWeight: { type: Number, min: 0, max: 1, default: 0.7 },
    attendanceWeight: { type: Number, min: 0, max: 1, default: 0.3 },
  },
  { timestamps: true, _id: false },
);

ratingSettingsSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const RatingSettings = mongoose.model("RatingSettings", ratingSettingsSchema);

export default RatingSettings;
