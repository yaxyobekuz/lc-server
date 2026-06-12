import mongoose from "mongoose";

export const FLOW_STATE_TYPES = ["feedback"];
export const FLOW_STATE_STEPS = [
  "awaiting_type",
  "awaiting_message",
  "awaiting_anonymity",
];

const flowStateSchema = new mongoose.Schema(
  {
    type: { type: String, enum: FLOW_STATE_TYPES, required: true },
    step: { type: String, enum: FLOW_STATE_STEPS, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const botUserSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, unique: true, index: true },
    chatId: { type: Number, required: true },
    username: { type: String, trim: true, lowercase: true, default: null },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    languageCode: { type: String, default: "uz" },
    isBot: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    flowState: { type: flowStateSchema, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// `user` bo'yicha unikal indeks: faqat bog'langan (null bo'lmagan) hujjatlar uchun.
// MUHIM: `sparse` indeks `null` ni "yo'q" deb hisoblamaydi, schema esa `default: null`
// qo'yadi - shu sabab bir nechta bog'lanmagan hujjat user:null bilan to'qnashib,
// E11000 xatoga olib kelardi (Telegram bog'lanmasdi). `partialFilterExpression` bilan
// uniqueness faqat user mavjud bo'lganda tekshiriladi.
// `user` bo'yicha oddiy (NON-UNIQUE) indeks - faqat tezkor qidiruv uchun.
// Uniquelik ataylab YO'Q: bir Telegram boshqa akkauntga qayta bog'lanaversin
// (last-login-wins), hech qachon E11000 bermasin.
botUserSchema.index({ user: 1 });

botUserSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const BotUser = mongoose.model("BotUser", botUserSchema);

export default BotUser;
