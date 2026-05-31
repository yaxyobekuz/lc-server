import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import ExpenseType from "../models/expenseType.model.js";
import Expense from "../models/expense.model.js";
import logger from "../config/logger.js";

// Standart xarajat turlari
const DEFAULTS = ["Oylik", "Ijara", "Kommunal", "Reklama", "Boshqa"];

// Eski enum kategoriya → yangi tur nomi
const LEGACY_MAP = {
  salary: "Oylik",
  rent: "Ijara",
  utility: "Kommunal",
  ads: "Reklama",
  other: "Boshqa",
};

const seed = async () => {
  await connectDB();

  // 1) Standart turlarni yaratamiz (idempotent)
  const byName = new Map();
  for (const name of DEFAULTS) {
    const doc = await ExpenseType.findOneAndUpdate(
      { name, isActive: true },
      { $setOnInsert: { name, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    byName.set(name, doc._id);
  }
  logger.info(`Xarajat turlari seed qilindi: ${DEFAULTS.length}`);

  // 2) Eski `category` (string) bo'lgan xarajatlarni `type` ga ko'chiramiz
  const legacy = await Expense.collection
    .find({ category: { $exists: true }, type: { $exists: false } })
    .toArray();

  let migrated = 0;
  for (const exp of legacy) {
    const name = LEGACY_MAP[exp.category] || "Boshqa";
    const typeId = byName.get(name);
    if (!typeId) continue;
    await Expense.collection.updateOne(
      { _id: exp._id },
      { $set: { type: typeId }, $unset: { category: "" } },
    );
    migrated += 1;
  }
  logger.info(`Migratsiya: ${migrated} ta xarajat 'type' ga ko'chirildi`);

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Xarajat turlari seed xato");
  process.exit(1);
});
