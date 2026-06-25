// Foydalanuvchini BUTUNLAY (hard) o'chirish uchun bog'liqlik tekshiruvi.
// Qoida: foydalanuvchi biror domen/moliya ma'lumotiga bog'liq bo'lsa - o'chirib
// BO'LMAYDI (aks holda kirim/qarz/oylik hisob-kitoblari buziladi). Faqat hech
// qanday biznes ma'lumoti bo'lmagandagina hujjat 100% drop qilinadi.
import mongoose from "mongoose";
import GroupMembership from "../models/groupMembership.model.js";
import Attendance from "../models/attendance.model.js";
import AttendanceExemption from "../models/attendanceExemption.model.js";
import Grade from "../models/grade.model.js";
import StudentPayment from "../models/studentPayment.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import StudentDeposit from "../models/studentDeposit.model.js";
import DepositTransaction from "../models/depositTransaction.model.js";
import Discount from "../models/discount.model.js";
import Feedback from "../models/feedback.model.js";
import Lead from "../models/lead.model.js";
import Group from "../models/group.model.js";
import TeacherAttendance from "../models/teacherAttendance.model.js";
import TeacherAbsence from "../models/teacherAbsence.model.js";
import TeacherSalary from "../models/teacherSalary.model.js";
import SalaryTransaction from "../models/salaryTransaction.model.js";
import TeacherGroupPeriod from "../models/teacherGroupPeriod.model.js";
import RefreshToken from "../models/refreshToken.model.js";
import ActivityLog from "../models/activityLog.model.js";
import NotificationRecipient from "../models/notificationRecipient.model.js";
import ArchiveLog from "../models/archiveLog.model.js";
import BotUser from "../models/botUser.model.js";

// Bloklovchi bog'liqliklar: foydalanuvchi shu yozuvlarning SUBYEKTI bo'lsa,
// o'chirish taqiqlanadi. (createdBy/updatedBy kabi audit maydonlari bloklamaydi.)
// query(id) -> shu foydalanuvchiga tegishli filtr. isDeleted holatidan qat'i
// nazar sanaymiz - soft-delete qilingan yozuv ham havola sifatida qoladi.
const BLOCKING_RELATIONS = [
  // ── O'quvchi (student) sifatidagi bog'liqliklar ──
  { model: GroupMembership, query: (id) => ({ student: id }), label: "Guruh a'zoligi" },
  { model: Attendance, query: (id) => ({ student: id }), label: "Davomat yozuvlari" },
  { model: AttendanceExemption, query: (id) => ({ student: id }), label: "Davomat imtiyozlari" },
  { model: Grade, query: (id) => ({ student: id }), label: "Baholar" },
  { model: StudentPayment, query: (id) => ({ student: id }), label: "To'lov hisoblari" },
  { model: PaymentTransaction, query: (id) => ({ student: id }), label: "To'lov tranzaksiyalari" },
  { model: StudentDeposit, query: (id) => ({ student: id }), label: "Depozit hisobi" },
  { model: DepositTransaction, query: (id) => ({ student: id }), label: "Depozit tranzaksiyalari" },
  { model: Discount, query: (id) => ({ student: id }), label: "Chegirmalar" },
  { model: Feedback, query: (id) => ({ author: id }), label: "Fikr-mulohazalar" },
  { model: Lead, query: (id) => ({ studentId: id }), label: "Lid (konversiya)" },

  // ── O'qituvchi (teacher) sifatidagi bog'liqliklar ──
  { model: Group, query: (id) => ({ teachers: id }), label: "Biriktirilgan guruhlar" },
  { model: TeacherAttendance, query: (id) => ({ teacher: id }), label: "O'qituvchi davomati" },
  { model: TeacherAbsence, query: (id) => ({ teacher: id }), label: "O'qituvchi yo'qliklari" },
  { model: TeacherSalary, query: (id) => ({ teacher: id }), label: "O'qituvchi oyliklari" },
  { model: SalaryTransaction, query: (id) => ({ teacher: id }), label: "Oylik tranzaksiyalari" },
  { model: TeacherGroupPeriod, query: (id) => ({ teacher: id }), label: "O'qituvchi guruh davrlari" },
];

// Foydalanuvchiga bog'liq, o'chirishni TAQIQLOVCHI ma'lumotlar ro'yxati.
// Qaytaradi: [{ label, count }] - bo'sh bo'lsa, o'chirish mumkin.
export const findUserBlockingRelations = async (userId) => {
  const id = new mongoose.Types.ObjectId(userId);
  const counts = await Promise.all(
    BLOCKING_RELATIONS.map((r) => r.model.countDocuments(r.query(id))),
  );
  return BLOCKING_RELATIONS.map((r, i) => ({ label: r.label, count: counts[i] })).filter(
    (r) => r.count > 0,
  );
};

// Bloklamaydigan qoldiq ma'lumot (sessiya/audit/yetkazish) - hard o'chirishda
// birga drop qilinadi. Bular hisob-kitobga ta'sir qilmaydi.
export const purgeUserResidualData = async (userId) => {
  const id = new mongoose.Types.ObjectId(userId);
  await Promise.all([
    RefreshToken.deleteMany({ user: id }),
    ActivityLog.deleteMany({ user: id }),
    NotificationRecipient.deleteMany({ user: id }),
    ArchiveLog.deleteMany({ user: id }),
    // Telegram ulanishini uzamiz (botUser hujjati telegramId bo'yicha qoladi).
    BotUser.updateMany({ user: id }, { $set: { user: null, flowState: null } }),
  ]);
};
