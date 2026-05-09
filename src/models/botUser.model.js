import mongoose from "mongoose";

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
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

botUserSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const BotUser = mongoose.model("BotUser", botUserSchema);

export default BotUser;
