import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import ActivityLog from "../models/activityLog.model.js";
import DepositTransaction from "../models/depositTransaction.model.js";
import StudentDeposit from "../models/studentDeposit.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";

// TEKSHIRUV (hech narsa YOZMAYDI): butunlay o'chirilgan guruhlar bo'yicha
// nima tiklash mumkinligini aniqlaydi. hardDeleteGroupData deleteMany ishlatadi -
// ya'ni hujjatlar FIZIK o'chgan, softDelete bayrog'i qo'yilmagan. Shu sababli
// tiklash faqat quyidagilardan mumkin:
//   1) mongodump/snapshot zaxirasi (eng ishonchli),
//   2) replica set oplog oynasi hali o'sha davrni qamrasa,
//   3) ActivityLog'dagi so'rov tanalari (qisman - faqat yozish amallari).
// Skript shu uchtasini ham tekshirib, aniq xulosa chiqaradi.

const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);
const fullName = (u) => `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "-";
const iso = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "-");

// 1) O'chirish amallari - ActivityLog'dagi DELETE /api/groups/:id yozuvlari.
const findDeletions = async () => {
  const rows = await ActivityLog.find({
    method: "DELETE",
    resourceType: "group",
    status: { $gte: 200, $lt: 300 },
  })
    .sort({ createdAt: -1 })
    .populate("user", { firstName: 1, lastName: 1, username: 1 })
    .lean();

  // Faqat guruhning o'zini o'chirish (/api/groups/:id) - a'zo/davr o'chirish emas.
  return rows.filter((r) => /^\/api\/groups\/[a-f0-9]{24}\/?$/i.test((r.path || "").split("?")[0]));
};

// 2) O'chirilgan guruh ID'si bo'yicha ActivityLog izlari.
const traceFor = async (groupId, deletedAt) => {
  const logs = await ActivityLog.find({
    createdAt: { $lte: deletedAt },
    $or: [
      { path: { $regex: groupId, $options: "i" } },
      { "body.group": groupId },
      { "body.groupId": groupId },
    ],
  })
    .sort({ createdAt: 1 })
    .lean();

  const byPath = new Map();
  for (const l of logs) {
    // ID'larni olib tashlab guruhlaymiz: /api/groups/<id>/students → shakl bo'yicha
    const key = `${l.method} ${(l.path || "").replace(/[a-f0-9]{24}/gi, ":id").split("?")[0]}`;
    byPath.set(key, (byPath.get(key) || 0) + 1);
  }
  return { total: logs.length, byPath, logs };
};

// 3) Oplog oynasi - undan tiklash mumkinmi.
const checkOplog = async (deletedAt) => {
  const admin = mongoose.connection.db.admin();
  let isReplicaSet = false;
  try {
    const hello = await admin.command({ hello: 1 });
    isReplicaSet = Boolean(hello.setName);
  } catch {
    isReplicaSet = false;
  }
  if (!isReplicaSet) return { isReplicaSet: false };

  const oplog = mongoose.connection.client.db("local").collection("oplog.rs");
  const [first] = await oplog.find({}).sort({ $natural: 1 }).limit(1).toArray();
  const [last] = await oplog.find({}).sort({ $natural: -1 }).limit(1).toArray();
  const from = first?.wall || (first?.ts ? new Date(first.ts.getHighBits() * 1000) : null);
  const to = last?.wall || (last?.ts ? new Date(last.ts.getHighBits() * 1000) : null);

  // O'chirish paytidagi delete amallari hali oynada turibdimi.
  let deletesInWindow = 0;
  if (deletedAt && from && new Date(deletedAt) >= from) {
    deletesInWindow = await oplog.countDocuments({
      op: "d",
      ns: { $regex: /\.(studentpayments|paymenttransactions|groupmemberships)$/ },
      wall: {
        $gte: new Date(new Date(deletedAt).getTime() - 60000),
        $lte: new Date(new Date(deletedAt).getTime() + 60000),
      },
    });
  }

  // Pre-image'lar yoqilganmi (yoqilgan bo'lsa o'chgan hujjat MAZMUNI ham bor).
  let preImages = 0;
  try {
    preImages = await mongoose.connection.client
      .db("config")
      .collection("system.preimages")
      .estimatedDocumentCount();
  } catch {
    preImages = -1;
  }

  return { isReplicaSet: true, from, to, deletesInWindow, preImages };
};

const inspect = async () => {
  await connectDB();

  const deletions = await findDeletions();
  if (!deletions.length) {
    console.log("ActivityLog'da guruh o'chirish amali topilmadi.");
    console.log("(Audit log saqlanish muddati o'tgan bo'lishi mumkin.)");
  }

  for (const d of deletions) {
    const groupId = d.resourceId;
    const name = d.body?.confirmName || "(nom noma'lum)";
    const stillExists = await Group.exists({ _id: groupId });

    console.log(`\n${"=".repeat(70)}`);
    console.log(`GURUH: ${name}`);
    console.log(`  ID          : ${groupId}`);
    console.log(`  O'chirilgan : ${iso(d.createdAt)}`);
    console.log(`  Kim         : ${fullName(d.user)} (${d.user?.username || "-"})`);
    console.log(`  Hozir bormi : ${stillExists ? "HA (tiklangan)" : "YO'Q"}`);
    if (stillExists) continue;

    const trace = await traceFor(groupId, d.createdAt);
    console.log(`\n  ActivityLog izlari: ${trace.total} ta yozuv`);
    for (const [k, n] of [...trace.byPath].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)} × ${k}`);
    }

    // Qaytarilgan garov - o'chirishning tirik qolgan yagona moliyaviy izi.
    const refunds = await DepositTransaction.find({
      type: "refund",
      note: "Guruh o'chirildi - depozitga qaytarildi",
      paidAt: { $gte: new Date(new Date(d.createdAt).getTime() - 86400000) },
      isDeleted: { $ne: true },
    })
      .populate("student", { firstName: 1, lastName: 1, username: 1 })
      .lean();

    if (refunds.length) {
      console.log(`\n  Depozitga qaytarilgan garov (tiklashda bekor qilinadi):`);
      for (const r of refunds) {
        const dep = await StudentDeposit.findOne({ student: r.student?._id }, { balance: 1 }).lean();
        const spent = await PaymentTransaction.countDocuments({
          student: r.student?._id,
          source: "deposit",
          isDeleted: { $ne: true },
          createdAt: { $gte: r.paidAt },
        });
        console.log(
          `    ${fullName(r.student)}: ${money(r.amount)} so'm | hozirgi balans ${money(dep?.balance)} | keyin qoplangan: ${spent} ta`,
        );
      }
    }
  }

  // Oplog - eng yangi o'chirish sanasi bo'yicha.
  const newest = deletions[0]?.createdAt || null;
  const oplog = await checkOplog(newest);
  console.log(`\n${"=".repeat(70)}`);
  console.log("TIKLASH IMKONIYATLARI");
  if (!oplog.isReplicaSet) {
    console.log("  Oplog        : YO'Q (standalone MongoDB) - oplogdan tiklab bo'lmaydi");
  } else {
    console.log(`  Oplog oynasi : ${iso(oplog.from)} → ${iso(oplog.to)}`);
    console.log(`  O'chirish paytidagi delete yozuvlari: ${oplog.deletesInWindow}`);
    console.log(
      `  Pre-image'lar: ${oplog.preImages < 0 ? "o'qib bo'lmadi" : oplog.preImages} ` +
        "(0 bo'lsa - o'chgan hujjat MAZMUNI oplogda yo'q, faqat _id)",
    );
  }
  console.log("\n  XULOSA:");
  console.log("  1. Zaxira (mongodump / snapshot) bormi? → eng ishonchli yo'l.");
  console.log("     Tiklash: npm run restore:group -- --from <zaxira-mongo-uri> --group <id>");
  console.log("  2. Oplog oynasi guruh YARATILGAN kundan boshlansagina to'liq");
  console.log("     qayta tiklash mumkin (insert'larni qayta o'ynatish).");
  console.log("  3. Aks holda ActivityLog'dan faqat QISMAN: guruh, a'zoliklar,");
  console.log("     oylik narx va chegirmalar tiklanadi; naqd to'lov summalari");
  console.log("     o'quvchiga bog'lab bo'lmaydi (paymentId o'chgan).");

  await disconnectDB();
};

inspect().catch((err) => {
  logger.error({ err }, "O'chirilgan guruhlar tekshiruvi xato");
  process.exit(1);
});
