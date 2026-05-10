import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import PaymentMethod from "../models/paymentMethod.model.js";
import DiscountKind from "../models/discountKind.model.js";
import PaymentSettings from "../models/paymentSettings.model.js";
import logger from "../config/logger.js";

const PAYMENT_METHODS = [
  { name: "Naqd", code: "cash" },
  { name: "Karta", code: "card" },
  { name: "Click", code: "click" },
  { name: "Payme", code: "payme" },
  { name: "Bank o'tkazma", code: "bank_transfer" },
];

const DISCOUNT_KINDS = ["Oilaviy", "Ijtimoiy", "Aksiya", "Sodiqlik", "Boshqa"];

const seed = async () => {
  await connectDB();

  for (const m of PAYMENT_METHODS) {
    await PaymentMethod.findOneAndUpdate(
      { code: m.code, isActive: true },
      {
        $setOnInsert: { name: m.name, code: m.code, isActive: true },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  logger.info(`To'lov usullari seed qilindi: ${PAYMENT_METHODS.length}`);

  for (const name of DISCOUNT_KINDS) {
    await DiscountKind.findOneAndUpdate(
      { name, isActive: true },
      { $setOnInsert: { name, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  logger.info(`Chegirma turlari seed qilindi: ${DISCOUNT_KINDS.length}`);

  await PaymentSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  logger.info("To'lov sozlamalari (default) tayyor");

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Payment defaults seed xato");
  process.exit(1);
});
