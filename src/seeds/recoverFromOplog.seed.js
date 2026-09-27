import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import GroupFee from "../models/groupFee.model.js";
import StudentPayment from "../models/studentPayment.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import Discount from "../models/discount.model.js";
import Attendance from "../models/attendance.model.js";
import Grade from "../models/grade.model.js";
import TeacherAbsence from "../models/teacherAbsence.model.js";
import Feedback from "../models/feedback.model.js";
import TeacherGroupPeriod from "../models/teacherGroupPeriod.model.js";
import TeacherSalary from "../models/teacherSalary.model.js";
import SalaryTransaction from "../models/salaryTransaction.model.js";

// Zaxira (backup) yo'q bo'lsa - fizik o'chirilgan guruhni REPLICA SET OPLOG'idan
// qayta tiklaydi. Oplog barcha yozuv amallarini saqlaydi: insert'da hujjatning
// TO'LIQ mazmuni, update'da o'zgarish diff'i bor. Shularni bo'sh vaqtinchalik
// bazaga qayta o'ynatib (applyOps), o'chirishdan OLDINGI holatni tiklaymiz.
// Keyin o'sha bazadan odatdagi restore:group ishlatiladi.
//
// Ishlatish:
//   npm run recover:oplog                      # o'chirilgan guruhlarni topadi
//   npm run recover:oplog -- --group <id>       # nima tiklanishini ko'rsatadi
//   npm run recover:oplog -- --group <id> --apply
//
// MUHIM: oplog - capped (cheklangan) kolleksiya. Har yangi yozuv eskisini siqib
// chiqaradi. Guruh YARATILGAN kun oyna ichida qolmasa, to'liq tiklab bo'lmaydi.
// Shu sababli buni imkon qadar TEZ bajarish kerak.

const MODELS = [
  Group,
  GroupMembership,
  GroupFee,
  StudentPayment,
  PaymentTransaction,
  Discount,
  Attendance,
  Grade,
  TeacherAbsence,
  Feedback,
  TeacherGroupPeriod,
  TeacherSalary,
  SalaryTransaction,
];

const parseArgs = () => {
  const out = { apply: false, target: "bayyina_oplog_recovered" };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === "--apply") out.apply = true;
    else if (a[i] === "--group") out.group = a[++i];
    else if (a[i] === "--target") out.target = a[++i];
  }
  return out;
};

const iso = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "-");
const tsDate = (e) => e?.wall || (e?.ts ? new Date(e.ts.getHighBits() * 1000) : null);

const oplogOf = () => mongoose.connection.client.db("local").collection("oplog.rs");

const assertReplicaSet = async () => {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) {
    throw new Error(
      "Bu MongoDB replica set EMAS (standalone) - oplog yo'q, oplogdan tiklab bo'lmaydi",
    );
  }
  return hello.setName;
};

const windowInfo = async () => {
  const op = oplogOf();
  const [first] = await op.find({}).sort({ $natural: 1 }).limit(1).toArray();
  const [last] = await op.find({}).sort({ $natural: -1 }).limit(1).toArray();
  return { from: tsDate(first), to: tsDate(last) };
};

// Oplogdagi guruh o'chirish izlari - qaysi guruhlar o'chirilgan.
const findDeletedGroups = async (dbName) => {
  const op = oplogOf();
  const dels = await op
    .find({ op: "d", ns: `${dbName}.${Group.collection.name}` })
    .sort({ $natural: 1 })
    .toArray();
  const out = [];
  for (const d of dels) {
    const gid = d.o?._id;
    if (!gid) continue;
    if (await Group.exists({ _id: gid })) continue; // qaytarilgan
    // Nomini insert yozuvidan olamiz.
    const ins = await op.findOne({
      op: "i",
      ns: `${dbName}.${Group.collection.name}`,
      "o._id": gid,
    });
    out.push({ _id: gid, name: ins?.o?.name || "(nom oplogda yo'q)", deletedAt: tsDate(d) });
  }
  return out;
};

// Guruhga tegishli hujjat _id'larini oplog insert'laridan yig'adi.
const collectIds = async (dbName, gid) => {
  const op = oplogOf();
  const namespaces = MODELS.map((M) => `${dbName}.${M.collection.name}`);
  const ids = new Map(); // ns → Set(_id)

  const groupNs = `${dbName}.${Group.collection.name}`;
  ids.set(groupNs, new Set([String(gid)]));

  const cursor = op.find({
    op: "i",
    ns: { $in: namespaces },
    "o.group": gid,
  });
  for await (const e of cursor) {
    if (!ids.has(e.ns)) ids.set(e.ns, new Set());
    ids.get(e.ns).add(String(e.o._id));
  }
  return ids;
};

// Shu _id'larga tegishli BARCHA i/u yozuvlarini vaqt tartibida oladi
// (delete'lar tashlab yuboriladi - biz aynan ularni bekor qilyapmiz).
const collectOps = async (dbName, idsByNs) => {
  const op = oplogOf();
  const clauses = [];
  for (const [ns, set] of idsByNs) {
    if (!set.size) continue;
    const oids = [...set].map((s) => new mongoose.Types.ObjectId(s));
    clauses.push({ ns, op: "i", "o._id": { $in: oids } });
    clauses.push({ ns, op: "u", "o2._id": { $in: oids } });
  }
  if (!clauses.length) return [];
  return op.find({ $or: clauses }).sort({ ts: 1 }).toArray();
};

const run = async () => {
  const args = parseArgs();
  await connectDB();
  const dbName = mongoose.connection.name;

  const setName = await assertReplicaSet();
  const win = await windowInfo();
  console.log(`\nReplica set : ${setName}`);
  console.log(`Oplog oynasi: ${iso(win.from)} → ${iso(win.to)}`);

  if (!args.group) {
    const deleted = await findDeletedGroups(dbName);
    if (!deleted.length) {
      console.log("\nOplogda o'chirilgan guruh topilmadi (oyna o'tib ketgan bo'lishi mumkin).");
    } else {
      console.log(`\nOplogda topilgan o'chirilgan guruhlar (${deleted.length} ta):\n`);
      for (const g of deleted) {
        console.log(`  ${g.name}`);
        console.log(`    --group ${g._id}   (o'chirilgan: ${iso(g.deletedAt)})`);
      }
    }
    await disconnectDB();
    return;
  }

  const gid = new mongoose.Types.ObjectId(String(args.group));
  const idsByNs = await collectIds(dbName, gid);
  const ops = await collectOps(dbName, idsByNs);

  console.log(`\nGuruh ${gid} uchun oplogdan topildi:`);
  let totalDocs = 0;
  for (const [ns, set] of idsByNs) {
    if (!set.size) continue;
    totalDocs += set.size;
    console.log(`  ${String(set.size).padStart(5)} hujjat × ${ns.split(".")[1]}`);
  }
  const inserts = ops.filter((o) => o.op === "i").length;
  const updates = ops.filter((o) => o.op === "u").length;
  console.log(`\n  Qayta o'ynatiladigan amallar: ${inserts} insert + ${updates} update`);
  console.log(`  Eng eski amal: ${iso(tsDate(ops[0]))}`);

  if (!totalDocs || totalDocs === 1) {
    console.log("\n  DIQQAT: oplogda guruh hujjatlari yo'q - oyna o'tib ketgan.");
    console.log("  To'liq tiklab bo'lmaydi. ActivityLog'dan qisman tiklash qoladi.");
  }

  if (!args.apply) {
    console.log(`\nHech narsa yozilmadi. Tiklash uchun --apply qo'shing.`);
    console.log(`Natija "${args.target}" bazasiga yoziladi (jonli bazaga TEGILMAYDI).`);
    await disconnectDB();
    return;
  }

  // applyOps mavjud bo'lmagan kolleksiyaga yoza olmaydi - avval yaratamiz.
  const targetDb = mongoose.connection.client.db(args.target);
  for (const ns of new Set(ops.map((e) => e.ns.split(".").slice(1).join(".")))) {
    await targetDb.createCollection(ns).catch(() => {});
  }

  // Amallarni vaqtinchalik bazaga qayta o'ynatamiz. applyOps update diff'larini
  // (`$v:2`) MongoDB'ning o'zi qo'llaydi - qo'lda diff yozish shart emas.
  const admin = mongoose.connection.db.admin();
  const BATCH = 500;
  let applied = 0;
  for (let i = 0; i < ops.length; i += BATCH) {
    const batch = ops.slice(i, i + BATCH).map((e) => ({
      op: e.op,
      ns: `${args.target}.${e.ns.split(".").slice(1).join(".")}`,
      o: e.o,
      ...(e.o2 ? { o2: e.o2 } : {}),
      ...(e.op === "u" ? { b: true } : {}), // yo'q hujjatda upsert - insert rolled off bo'lsa
    }));
    await admin.command({ applyOps: batch });
    applied += batch.length;
  }

  console.log(`\n${applied} amal "${args.target}" bazasiga qayta o'ynatildi.`);
  console.log("Endi odatdagi tiklashni ishga tushiring:");
  console.log(
    `  npm run restore:group -- --from "mongodb://127.0.0.1:27017/${args.target}" --group ${gid} --end-date <YYYY-MM-DD>`,
  );
  await disconnectDB();
};

run().catch((err) => {
  logger.error({ err: err.message }, "Oplogdan tiklash xato");
  process.exit(1);
});
