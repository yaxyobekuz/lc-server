import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import LeadStatus from "../models/leadStatus.model.js";
import LeadSource from "../models/leadSource.model.js";
import LeadDirection from "../models/leadDirection.model.js";
import LeadSettings from "../models/leadSettings.model.js";
import logger from "../config/logger.js";

const LEAD_STATUSES = [
  {
    name: "Yangi",
    color: "#94a3b8",
    order: 1,
    isInitial: true,
    isFinal: false,
    isConverted: false,
  },
  {
    name: "Bog'lanildi",
    color: "#38bdf8",
    order: 2,
    isInitial: false,
    isFinal: false,
    isConverted: false,
  },
  {
    name: "Sinovga taklif",
    color: "#a78bfa",
    order: 3,
    isInitial: false,
    isFinal: false,
    isConverted: false,
  },
  {
    name: "Sinovda qatnashdi",
    color: "#f59e0b",
    order: 4,
    isInitial: false,
    isFinal: false,
    isConverted: false,
  },
  {
    name: "Ro'yxatdan o'tdi",
    color: "#22c55e",
    order: 5,
    isInitial: false,
    isFinal: true,
    isConverted: true,
  },
  {
    name: "Rad etdi",
    color: "#ef4444",
    order: 6,
    isInitial: false,
    isFinal: true,
    isConverted: false,
  },
];

const LEAD_SOURCES = [
  "Instagram",
  "Reklama",
  "Do'st tavsiyasi",
  "Qo'ng'iroq",
  "Tashrif",
  "Web-sayt",
  "Boshqa",
];

const LEAD_DIRECTIONS = [];

const seed = async () => {
  await connectDB();

  for (const s of LEAD_STATUSES) {
    await LeadStatus.findOneAndUpdate(
      { name: s.name, isActive: true },
      { $setOnInsert: { ...s, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  logger.info(`Lid statuslari seed qilindi: ${LEAD_STATUSES.length}`);

  for (const name of LEAD_SOURCES) {
    await LeadSource.findOneAndUpdate(
      { name, isActive: true },
      { $setOnInsert: { name, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  logger.info(`Lid manbalari seed qilindi: ${LEAD_SOURCES.length}`);

  for (const name of LEAD_DIRECTIONS) {
    await LeadDirection.findOneAndUpdate(
      { name, isActive: true },
      { $setOnInsert: { name, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  await LeadSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  logger.info("Lid sozlamalari (default) tayyor");

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Lid defaults seed xato");
  process.exit(1);
});
