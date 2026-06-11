import mongoose from "mongoose";

// Tarixiy ma'lumot importi (onboarding sehrgari) partiyasi. Idempotentlik manbai:
// kliyent yuborgan takrorlanmas idempotencyKey unique - bir xil kalitli takror
// so'rov (double-click/refresh/retry) yangi ma'lumot YARATMAYDI, mavjud batch'ning
// natijasini (result snapshot) qaytaradi. O'chirilmaydi (audit izi) - softDelete yo'q.
const importBatchSchema = new mongoose.Schema(
  {
    // Kliyent generatsiya qiladigan takrorlanmas kalit (uuid kabi).
    idempotencyKey: { type: String, required: true, unique: true },
    // Import bosqichi: "pending" (boshlandi) → "completed" (muvaffaqiyatli).
    // Tranzaksiya rollback bo'lsa batch ham yozilmaydi, shuning uchun "failed"
    // odatda saqlanmaydi - lekin standalone (transaksiyasiz) rejim uchun bor.
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
    // Yaratilgan/bog'langan yozuvlar soni (hisobot uchun snapshot).
    summary: {
      studentsCreated: { type: Number, default: 0 },
      studentsLinked: { type: Number, default: 0 },
      paymentsCreated: { type: Number, default: 0 },
      transactionsCreated: { type: Number, default: 0 },
      totalCollected: { type: Number, default: 0 },
    },
    // Takror so'rovga qaytariladigan to'liq natija (group + summary + per-student).
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

const ImportBatch = mongoose.model("ImportBatch", importBatchSchema);

export default ImportBatch;
