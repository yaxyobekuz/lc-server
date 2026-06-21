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
  },
  { timestamps: true },
);

const StudentDeposit = mongoose.model("StudentDeposit", studentDepositSchema);

export default StudentDeposit;
