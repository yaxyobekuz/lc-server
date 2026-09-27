import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import DepositTransaction from "../models/depositTransaction.model.js";
import StudentDeposit from "../models/studentDeposit.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";

// HISOBOT (hech narsa YOZMAYDI): guruh butunlay o'chirilganda o'quvchi depozitiga
// qaytarilgan garov puli qayerga ketganini ko'rsatadi. Guruh o'chirish endi
// to'lov tarixi bo'lsa taqiqlangan, lekin taqiq qo'yilgunga qadar qaytarilgan
// summalar depozitda qolgan yoki boshqa guruh oylariga qoplanib ketgan bo'lishi
// mumkin - egasi nimani "Yechib olish" kerakligini shu ro'yxatdan ko'radi.
const NOTE = "Guruh o'chirildi - depozitga qaytarildi";

const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);
const fullName = (u) => `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "-";

const report = async () => {
  await connectDB();

  const refunds = await DepositTransaction.find({
    type: "refund",
    note: NOTE,
    isDeleted: { $ne: true },
  })
    .sort({ paidAt: 1 })
    .lean();

  if (!refunds.length) {
    logger.info("Guruh o'chirilishi sababli qaytarilgan depozit topilmadi");
    await disconnectDB();
    return;
  }

  // O'quvchi bo'yicha guruhlaymiz: eng ERTA qaytarim sanasi kesish nuqtasi -
  // undan keyingi depozit-qoplamalar aynan shu pulni sarflagan bo'lishi mumkin.
  const byStudent = new Map();
  for (const r of refunds) {
    const key = String(r.student);
    const row = byStudent.get(key) || { total: 0, firstAt: r.paidAt, count: 0 };
    row.total += r.amount || 0;
    row.count += 1;
    if (r.paidAt < row.firstAt) row.firstAt = r.paidAt;
    byStudent.set(key, row);
  }

  for (const [studentId, row] of byStudent) {
    const [student, deposit, spent] = await Promise.all([
      User.findById(studentId, { firstName: 1, lastName: 1, username: 1 }).lean(),
      StudentDeposit.findOne({ student: studentId }, { balance: 1 }).lean(),
      PaymentTransaction.find(
        {
          student: studentId,
          source: "deposit",
          isDeleted: { $ne: true },
          createdAt: { $gte: row.firstAt },
        },
        { group: 1, amount: 1, createdAt: 1, payment: 1 },
      )
        .populate("group", { name: 1 })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const spentTotal = spent.reduce((s, t) => s + (t.amount || 0), 0);
    const balance = deposit?.balance || 0;

    console.log(`\n${fullName(student)} (${student?.username || "-"})`);
    console.log(`  Qaytarilgan garov      : ${money(row.total)} so'm (${row.count} ta yozuv)`);
    console.log(`  Hozirgi depozit balansi: ${money(balance)} so'm  → "Yechib olish" mumkin`);
    console.log(`  Qaytarimdan keyin qoplangan (boshqa guruh oylari): ${money(spentTotal)} so'm`);
    for (const t of spent) {
      console.log(
        `    - ${t.group?.name || "(o'chirilgan guruh)"}: ${money(t.amount)} so'm, ${new Date(t.createdAt).toISOString().slice(0, 10)}`,
      );
    }
    if (spentTotal > 0) {
      console.log("    ! Bu oylar garov hisobidan yopilgan - kerak bo'lsa");
      console.log("      To'lovlar tarixida o'sha tranzaksiyani bekor qiling.");
    }
  }

  const total = refunds.reduce((s, r) => s + (r.amount || 0), 0);
  console.log(
    `\nJAMI: ${byStudent.size} o'quvchi, ${money(total)} so'm qaytarilgan.`,
  );

  // O'chirilgan guruhlar endi mavjud emas - ro'yxat faqat ma'lumot uchun.
  const groups = await Group.countDocuments({ isDeleted: { $ne: true } });
  logger.info({ students: byStudent.size, total, activeGroups: groups }, "Hisobot tayyor");
  await disconnectDB();
};

report().catch((err) => {
  logger.error({ err }, "Qaytarim hisoboti xato");
  process.exit(1);
});
