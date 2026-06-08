import mongoose from "mongoose";

// Telegram long-polling FAQAT bitta instansda ishlashi kerak (aks holda 409
// conflict). Bu lock orqali ko'p-instansli deploy'da faqat bitta instans poll
// qiladi; qolganlar baribir xabar YUBORA oladi (sendMessage polling talab qilmaydi).
const botLockSchema = new mongoose.Schema(
  {
    _id: { type: String }, // doimiy: "poller"
    holder: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, _id: false },
);

const BotLock = mongoose.model("BotLock", botLockSchema);

export default BotLock;
