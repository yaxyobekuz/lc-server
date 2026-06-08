import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import { ROLES } from "../constants/roles.js";
import User from "../models/user.model.js";
import Invoice from "../models/invoice.model.js";
import Payment from "../models/payment.model.js";
import PaymentMethod from "../models/paymentMethod.model.js";
import {
  generateForPeriod,
  recompute,
} from "../modules/invoices/services/invoices.service.js";

// JORIY OY uchun invoice + to'lovlarni yaratadi (guruh detail "Bu oy to'lovi" /
// "Qarz" ustunlari bo'sh ("Hisob yo'q") qolmasligi uchun). Haqiqiy generateForPeriod
// (prorate/chegirma) + recompute (paidAmount/status) ishlatiladi — to'liq izchil.
// Idempotent: generateForPeriod mavjud invoice'ni o'tkazib yuboradi; to'lov faqat
// hali to'lanmagan (paidAmount=0) invoice'larga qo'shiladi.

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randDate = (from, to) =>
  new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));

const seed = async () => {
  await connectDB();
  const startedAt = Date.now();

  const owner = await User.findOne({ role: ROLES.OWNER }).lean();
  if (!owner) throw new Error("Owner yo'q. Avval `npm run seed:owner`.");
  const methods = await PaymentMethod.find({ isActive: true }).lean();
  if (methods.length === 0) {
    throw new Error("PaymentMethod yo'q. Avval `npm run seed:payments`.");
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1);

  // 1) Joriy oy invoice'larini yaratish (haqiqiy mantiq, idempotent)
  const gen = await generateForPeriod({ year, month }, { createdBy: owner._id });
  logger.info(
    { year, month, ...gen },
    "Joriy oy invoice'lari yaratildi (generateForPeriod)",
  );

  // 2) Invoice'larga realistik to'lovlar
  const invoices = await Invoice.find({
    "period.year": year,
    "period.month": month,
    status: { $ne: "cancelled" },
    isDeleted: { $ne: true },
  })
    .select("student totalDue paidAmount status")
    .lean();

  let paid = 0;
  let partial = 0;
  let left = 0;
  for (const inv of invoices) {
    // Allaqachon to'lov bo'lgan bo'lsa — tegmaymiz (idempotent)
    if ((inv.paidAmount || 0) > 0 || inv.status === "paid") continue;
    if (!inv.totalDue || inv.totalDue <= 0) continue;

    const r = Math.random();
    let amount = 0;
    if (r < 0.45) {
      amount = inv.totalDue; // to'liq to'landi
      paid += 1;
    } else if (r < 0.65) {
      amount =
        Math.floor((inv.totalDue * (0.3 + Math.random() * 0.4)) / 10000) * 10000;
      if (amount >= inv.totalDue) amount = inv.totalDue - 10000;
      partial += 1;
    } else {
      left += 1; // to'lanmagan qoladi
      continue;
    }
    if (amount <= 0) {
      left += 1;
      continue;
    }

    await Payment.create({
      invoice: inv._id,
      student: inv.student,
      amount,
      type: "payment",
      method: pick(methods)._id,
      paidAt: randDate(monthStart, now),
      receivedBy: owner._id,
    });
    // paidAmount/status ni to'lovlardan qayta hisoblash (izchillik)
    await recompute(inv._id);
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `Joriy oy to'lovlari tayyor (${secs}s): ${invoices.length} invoice — ${paid} to'liq, ${partial} qisman, ${left} to'lanmagan`,
  );
  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Joriy oy to'lov seed xato");
  process.exit(1);
});
