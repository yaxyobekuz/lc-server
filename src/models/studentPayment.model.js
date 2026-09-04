import mongoose from "mongoose";

// O'quvchining bir guruh, bir oy uchun oylik to'lovi. Snapshot maydonlar
// (baseFee/prorationFactor/discountApplied/expectedAmount) fee/chegirma/muzlatish
// o'zgarganda recalc() orqali yangilanadi. O'chirilmaydi (softDelete yo'q).
const studentPaymentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    membership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupMembership",
      default: null,
    },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    // Snapshot (recalc paytida yangilanadi)
    baseFee: { type: Number, required: true, default: 0 },
    prorationFactor: { type: Number, default: 1 },
    discountApplied: { type: Number, default: 0 },
    expectedAmount: { type: Number, required: true, default: 0 },

    // To'langan (PaymentTransaction yig'indisidan keshlanadi)
    paidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
      index: true,
    },
    recalculatedAt: { type: Date, default: null },

    // Undirib bo'lmaydigan qarz hisobdan chiqarilgan summa (umidsiz qarz).
    // expectedAmount/paidAmount TEGILMAYDI - "qancha hisoblangan" va "qancha
    // yig'ilgan" haqiqati saqlanadi. Undiriladigan qoldiq esa:
    //   expectedAmount - paidAmount - writtenOffAmount
    // Shu sababli hisobdan chiqarilgan oy qarzdorlar ro'yxatidan ham,
    // depozitdan avto-qoplashdan ham chiqib ketadi, lekin hisobotlarda
    // alohida "yo'qotilgan" ko'rsatkich bo'lib qoladi.
    // AMALDAGI qiymat - har doim qoldiqdan (expected - paid) oshmaydi, recalc'da
    // cheklanadi. Hisobotlar va qarzdorlar ro'yxati shuni ishlatadi.
    writtenOffAmount: { type: Number, default: 0, min: 0 },
    // Owner kechirishga qaror qilgan ASLIY summa. Saqlanmasa: proratsiya qarzni
    // vaqtincha kamaytirib (arxivlash), keyin u qaytganda (arxivdan chiqarish,
    // a'zolik sanasini tuzatish) kechirilgan qism yana undiriladigan bo'lib
    // qolardi va o'quvchi qarzdorlar ro'yxatida qayta paydo bo'lardi.
    writeOffRequested: { type: Number, default: 0, min: 0 },
    writtenOffAt: { type: Date, default: null },
    writtenOffBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    writeOffReason: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

// O'quvchi + guruh + oy uchun bitta yozuv
studentPaymentSchema.index(
  { student: 1, group: 1, year: 1, month: 1 },
  { unique: true },
);
// Hisobotlar uchun
studentPaymentSchema.index({ year: 1, month: 1, status: 1 });
// Qarzdorlar agregatsiyasi: hisobdan chiqarilgan oylarni tez ajratish uchun.
studentPaymentSchema.index({ writtenOffAt: 1 });

const StudentPayment = mongoose.model("StudentPayment", studentPaymentSchema);

export default StudentPayment;
