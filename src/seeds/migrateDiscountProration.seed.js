import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import StudentPayment from "../models/studentPayment.model.js";
import * as studentPaymentService from "../modules/finance/services/studentPayment.service.js";
import * as teacherSalaryService from "../modules/teacherSalary/services/teacherSalary.service.js";
import * as depositService from "../modules/deposits/services/deposit.service.js";

// Bir martalik migratsiya: chegirma endi PRORATSIYADAN OLDIN, to'liq oylik
// narxdan yechiladi (chegirmali narx = o'quvchining oylik to'lovi). Eski
// yozuvlarda tartib teskari edi - oy o'rtasida qo'shilgan/chiqarilgan
// chegirmali o'quvchida fixed chegirma butun prorata summani yeb, to'lov 0
// bo'lib qolgan. Shu yozuvlarni joriy mantiq bilan qayta hisoblaydi.
//
// 1) monthlyFee (yangi snapshot maydoni) barcha yozuvlarga to'ldiriladi.
// 2) Chegirmasi bor yozuvlar recalc() orqali qayta hisoblanadi - summa faqat
//    shularda o'zgaradi (chegirmasiz yozuvda ikki tartib bir xil natija beradi).
// 3) Tegishli guruh/oylar uchun o'qituvchi foiz maoshi (billed tushumga bog'liq)
//    va o'quvchi depoziti (yangi qarzni avto-qoplash) yangilanadi.
// Idempotent - qayta ishga tushirsa natija o'zgarmaydi.
const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  // 1) Yangi maydon: chegirmasi yo'q yozuvlarda oylik to'lov = guruh to'lovi.
  // Chegirmalilar 2-qadamda aniq qiymatga ega bo'ladi.
  const filled = await StudentPayment.updateMany({ monthlyFee: null }, [
    { $set: { monthlyFee: { $ifNull: ["$baseFee", 0] } } },
  ]);

  // 2) Chegirma qo'llangan yozuvlar - faqat shularda hisob tartibi ta'sir qiladi.
  const affected = await StudentPayment.find(
    { discountApplied: { $gt: 0 } },
    { _id: 1, student: 1, group: 1, year: 1, month: 1, expectedAmount: 1 },
  ).lean();

  const groupMonths = new Map();
  const students = new Set();
  let changed = 0;

  for (const p of affected) {
    const updated = await studentPaymentService.recalc(p._id);
    if (!updated) continue;
    if ((updated.expectedAmount || 0) !== (p.expectedAmount || 0)) {
      changed += 1;
      groupMonths.set(`${p.group}|${p.year}|${p.month}`, {
        group: p.group,
        year: p.year,
        month: p.month,
      });
      students.add(String(p.student));
    }
  }

  // 3) Kaskad: o'qituvchi foiz maoshi guruh billed tushumidan kelib chiqadi.
  for (const { group, year, month } of groupMonths.values()) {
    try {
      await teacherSalaryService.recalcForGroupMonth(group, year, month);
    } catch (err) {
      logger.warn({ err, group, year, month }, "O'qituvchi maoshi qayta hisoblanmadi");
    }
  }

  // Chegirmali o'quvchida to'lov 0 dan real summaga ko'tarilgani uchun qarz
  // paydo bo'ladi - garovi (depozit) bo'lsa darhol qoplaymiz.
  const deposits = await depositService.safeAutoApplyMany([...students]);

  logger.info(
    {
      monthlyFeeFilled: filled.modifiedCount,
      withDiscount: affected.length,
      amountChanged: changed,
      groupMonths: groupMonths.size,
      students: students.size,
      depositApplied: deposits.applied,
    },
    "Chegirma/proratsiya tartibi migratsiyasi",
  );

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`Chegirma/proratsiya migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "Chegirma/proratsiya migratsiya xato");
  process.exit(1);
});
