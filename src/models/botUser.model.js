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
    // DIQQAT: telegramId ATAYLAB unique EMAS. Bitta Telegram bir nechta User
    // akkauntiga bog'lanishi mumkin - har biri alohida BotUser hujjati bo'ladi
    // (bir xil telegramId, har xil user). Unikallik (telegramId, user) juftligida.
    telegramId: { type: Number, required: true, index: true },
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

// `user` bo'yicha oddiy (NON-UNIQUE) indeks - tezkor qidiruv uchun.
botUserSchema.index({ user: 1 });

// (telegramId, user) juftligi bo'yicha unikallik: bir xil Telegram bir xil userga
// faqat BIR marta bog'lanadi (takror login upsert qiladi, dublikat yaratmaydi).
// Lekin bir xil telegramId boshqa-boshqa userlarga bemalol bog'lanaveradi.
// partialFilterExpression: faqat user mavjud (bog'langan) hujjatlar uchun tekshiriladi -
// bog'lanmagan (user:null) hujjatlar bir-biri bilan to'qnashmaydi.
botUserSchema.index(
  { telegramId: 1, user: 1 },
  {
    unique: true,
    partialFilterExpression: { user: { $type: "objectId" } },
  },
);

botUserSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const BotUser = mongoose.model("BotUser", botUserSchema);

export default BotUser;
