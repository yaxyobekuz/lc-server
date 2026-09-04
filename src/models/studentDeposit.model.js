import mongoose from "mongoose";

// O'quvchining depozit (garov) hisobi. balance = hali oylik to'lovga QOPLANMAGAN,
// ushlab turilgan mablag' keshi (ledgerdan qayta hisoblanishi mumkin). Depozit
// o'quvchiga tegishli - tizim daromadi EMAS; faqat qoplanganda daromad bo'ladi.
const studentDepositSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    balance: { type: Number, default: 0, min: 0 },

    // Depozitdan qoplash BEKOR qilinganda (PaymentTransaction source:"deposit"
    // o'chirilganda) pul depozitga qaytadi va uni DARHOL o'sha qarzga qayta
    // qoplash bekor qilishning ma'nosini yo'qotardi. Shu sababli avto-qoplash
    // shu o'quvchi uchun to'xtatib turiladi. Bayroq DOIMIY - aks holda kunlik
    // avto-qoplash job'i tunda ownerning qarorini jimgina bekor qilardi.
    // Keyingi ataylab qilingan amal (to'ldirish, yechish yoki "Qarzga qoplash"
    // tugmasi) uni yechadi.
    autoApplyHold: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const StudentDeposit = mongoose.model("StudentDeposit", studentDepositSchema);

export default StudentDeposit;
