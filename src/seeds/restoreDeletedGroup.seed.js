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
import DepositTransaction from "../models/depositTransaction.model.js";
import StudentDeposit from "../models/studentDeposit.model.js";
import * as groupsService from "../modules/groups/services/groups.service.js";
import * as transactionService from "../modules/finance/services/transaction.service.js";
import * as studentPaymentService from "../modules/finance/services/studentPayment.service.js";
import * as teacherSalaryService from "../modules/teacherSalary/services/teacherSalary.service.js";
import { safeRecomputeStudentCompletion } from "../helpers/studentCompletion.helper.js";
import { toUtcMidnight, localTodayMidnight } from "../helpers/attendance.helper.js";

// Butunlay o'chirilgan guruhni ZAXIRADAN tiklaydi, depozitga qaytarilgan garovni
// joyiga qaytaradi va guruhni arxivlaydi (endDate). Fizik o'chirilgan hujjatlar
// jonli bazada yo'q - manba sifatida mongorestore qilingan zaxira bazasi kerak.
//
// Ishlatish:
//   npm run restore:group -- --from "<zaxira-mongo-uri>" --group <groupId>
//   ... --end-date 2026-07-31   # arxiv sanasi (default: zaxiradagi endDate yoki oxirgi leftAt)
//   ... --apply                 # YOZISH. Bo'lmasa faqat reja ko'rsatiladi (dry run).
//
// Idempotent: mavjud _id'lar qayta yozilmaydi, bekor qilingan qaytarim ikki marta
// yechilmaydi. Avval --apply'siz ishga tushirib rejani ko'ring.

const GROUP_FIELD = [
  [Group, "_id"],
  [GroupMembership, "group"],
  [GroupFee, "group"],
  [StudentPayment, "group"],
  [PaymentTransaction, "group"],
  [Discount, "group"],
  [Attendance, "group"],
  [Grade, "group"],
  [TeacherAbsence, "group"],
  [Feedback, "group"],
  [TeacherGroupPeriod, "group"],
  [TeacherSalary, "group"],
  [SalaryTransaction, "group"],
];

const REFUND_NOTE = "Guruh o'chirildi - depozitga qaytarildi";

const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);

const parseArgs = () => {
  const out = { apply: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === "--apply") out.apply = true;
    else if (a[i] === "--from") out.from = a[++i];
    else if (a[i] === "--group") out.group = a[++i];
    else if (a[i] === "--end-date") out.endDate = a[++i];
  }
  return out;
};

// Zaxiradan guruhga oid barcha hujjatlarni o'qiydi. Ulanish mongoose'ning O'Z
// drayveri orqali - alohida "mongodb" paketi boshqa BSON versiyasini beradi va
// undan o'qilgan ObjectId'ni mongoose yozayotganda BSONVersionError chiqaradi.
const readBackup = async (db, groupId) => {
  const gid = new mongoose.Types.ObjectId(String(groupId));
  const sets = [];
  for (const [Model, field] of GROUP_FIELD) {
    const col = db.collection(Model.collection.name);
    const docs = await col.find({ [field]: gid }).toArray();
    sets.push({ Model, name: Model.collection.name, docs });
  }
  return sets;
};

// Mavjud bo'lmagan hujjatlarni _id saqlagan holda qo'shadi.
const insertMissing = async (Model, docs) => {
  if (!docs.length) return { inserted: 0, skipped: 0 };
  const ids = docs.map((d) => d._id);
  const existing = await Model.collection
    .find({ _id: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();
  const have = new Set(existing.map((e) => String(e._id)));
  const fresh = docs.filter((d) => !have.has(String(d._id)));
  if (fresh.length) await Model.collection.insertMany(fresh, { ordered: false });
  return { inserted: fresh.length, skipped: docs.length - fresh.length };
};

// Garovni joyiga qaytarish: o'chirishda depozitga qaytarilgan summa endi yana
// guruh to'lovlariga sarflangan - shuning uchun balansdan yechamiz. Balans
// yetmasa, qaytarimdan KEYIN o'sha puldan qoplangan oylarni avval bekor qilamiz.
const reverseRefunds = async (studentIds, deletedAt, { apply }) => {
  const report = [];
  for (const studentId of studentIds) {
    const refunds = await DepositTransaction.find({
      student: studentId,
      type: "refund",
      note: REFUND_NOTE,
      isDeleted: { $ne: true },
      ...(deletedAt ? { paidAt: { $gte: new Date(new Date(deletedAt).getTime() - 86400000) } } : {}),
    }).sort({ paidAt: 1 });
    if (!refunds.length) continue;

    const need = refunds.reduce((s, r) => s + (r.amount || 0), 0);
    const deposit = await StudentDeposit.findOne({ student: studentId });
    let balance = deposit?.balance || 0;
    const voided = [];

    // Balans yetmasa - qaytarimdan keyin depozitdan qoplangan oylarni bekor qilamiz
    // (pul depozitga qaytadi, o'sha oylarda qarz tiklanadi - bu to'g'ri holat).
    if (balance < need) {
      const spent = await PaymentTransaction.find({
        student: studentId,
        source: "deposit",
        isDeleted: { $ne: true },
        createdAt: { $gte: refunds[0].paidAt },
      }).sort({ createdAt: -1 });
      for (const t of spent) {
        if (balance >= need) break;
        if (apply) await transactionService.remove(t._id, null);
        balance += t.amount || 0;
        voided.push({ id: String(t._id), amount: t.amount, group: String(t.group) });
      }
    }

    if (apply) {
      if (balance < need) {
        logger.warn(
          { student: String(studentId), need, balance },
          "Depozit balansi yetmadi - qaytarim qisman bekor qilinadi",
        );
      }
      const take = Math.min(need, balance);
      if (take > 0) {
        await StudentDeposit.updateOne(
          { student: studentId, balance: { $gte: take } },
          { $inc: { balance: -take }, $set: { autoApplyHold: false } },
        );
      }
      for (const r of refunds) {
        r.isDeleted = true;
        r.deletedAt = new Date();
        await r.save();
      }
    }
    report.push({ student: String(studentId), need, balance, voided: voided.length });
  }
  return report;
};

// --group berilmasa: zaxirada bor, jonli bazada YO'Q guruhlarni ro'yxatlaydi.
const listMissing = async (backupDb) => {
  const groups = await backupDb.collection(Group.collection.name).find({}).toArray();
  const liveIds = new Set(
    (await Group.collection.find({}, { projection: { _id: 1 } }).toArray()).map((g) =>
      String(g._id),
    ),
  );
  const missing = groups.filter((g) => !liveIds.has(String(g._id)));
  if (!missing.length) {
    console.log("Zaxiradagi barcha guruhlar jonli bazada mavjud - tiklash shart emas.");
    return;
  }
  console.log(`\nZaxirada bor, jonli bazada YO'Q guruhlar (${missing.length} ta):\n`);
  for (const g of missing) {
    const txns = await backupDb
      .collection(PaymentTransaction.collection.name)
      .find({ group: g._id, isDeleted: { $ne: true } })
      .toArray();
    const paid = txns.reduce((t, d) => t + (d.amount || 0), 0);
    const members = await backupDb
      .collection(GroupMembership.collection.name)
      .countDocuments({ group: g._id });
    console.log(`  ${g.name}`);
    console.log(`    --group ${g._id}`);
    console.log(
      `    o'quvchi: ${members} | to'lov: ${txns.length} ta, ${money(paid)} so'm | endDate: ${g.endDate ? new Date(g.endDate).toISOString().slice(0, 10) : "yo'q"}`,
    );
  }
  console.log("\nTiklash: npm run restore:group -- --from <uri> --group <id> --end-date <YYYY-MM-DD> --apply");
};

const run = async () => {
  const args = parseArgs();
  if (!args.from) {
    console.log("Ishlatish: npm run restore:group -- --from <zaxira-uri> [--group <id>] [--end-date YYYY-MM-DD] [--apply]");
    console.log("  --group berilmasa: tiklash mumkin bo'lgan guruhlar ro'yxati chiqadi.");
    process.exit(1);
  }

  await connectDB();
  const client = new mongoose.mongo.MongoClient(args.from);
  await client.connect();
  const backupDb = client.db();

  if (!args.group) {
    await listMissing(backupDb);
    await client.close();
    await disconnectDB();
    return;
  }

  const sets = await readBackup(backupDb, args.group);
  const groupSet = sets.find((s) => s.Model === Group);
  const groupDoc = groupSet?.docs?.[0];
  if (!groupDoc) {
    console.log(`Zaxirada ${args.group} guruhi topilmadi. --from URI to'g'rimi?`);
    await client.close();
    await disconnectDB();
    process.exit(1);
  }

  console.log(`\nGURUH: ${groupDoc.name} (${args.group})`);
  console.log(args.apply ? "REJIM: YOZISH (--apply)\n" : "REJIM: faqat reja (dry run)\n");
  let totalDocs = 0;
  for (const s of sets) {
    if (!s.docs.length) continue;
    totalDocs += s.docs.length;
    console.log(`  ${String(s.docs.length).padStart(5)} × ${s.name}`);
  }

  // Bekor qilingan (isDeleted) tranzaksiyalar summaga kirmaydi.
  const paid = (sets.find((s) => s.Model === PaymentTransaction)?.docs || [])
    .filter((d) => d.isDeleted !== true)
    .reduce((t, d) => t + (d.amount || 0), 0);
  console.log(`\n  Tiklanadigan to'lov summasi: ${money(paid)} so'm`);

  const studentIds = [
    ...new Set(
      (sets.find((s) => s.Model === GroupMembership)?.docs || []).map((d) => String(d.student)),
    ),
  ];
  console.log(`  Ta'sirlangan o'quvchilar   : ${studentIds.length}`);

  // Arxiv sanasi: berilgan → zaxiradagi endDate → oxirgi leftAt → bugun.
  const lastLeft = (sets.find((s) => s.Model === GroupMembership)?.docs || [])
    .map((d) => d.leftAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
  const endDate = args.endDate
    ? toUtcMidnight(args.endDate)
    : groupDoc.endDate
      ? toUtcMidnight(groupDoc.endDate)
      : lastLeft
        ? toUtcMidnight(lastLeft)
        : localTodayMidnight();
  console.log(`  Arxiv sanasi (endDate)     : ${endDate.toISOString().slice(0, 10)}`);

  const plan = await reverseRefunds(studentIds, groupDoc.deletedAtLog || null, { apply: false });
  if (plan.length) {
    console.log("\n  Bekor qilinadigan garov qaytarimlari:");
    for (const p of plan) {
      console.log(
        `    ${p.student}: ${money(p.need)} so'm (balans ${money(p.balance)}, bekor qilinadigan qoplama: ${p.voided})`,
      );
    }
  }

  if (!args.apply) {
    console.log("\nHech narsa yozilmadi. Tasdiqlash uchun --apply qo'shing.");
    await client.close();
    await disconnectDB();
    return;
  }

  // 1) Hujjatlarni qaytaramiz.
  for (const s of sets) {
    const r = await insertMissing(s.Model, s.docs);
    if (r.inserted || r.skipped) {
      console.log(`  ${s.name}: +${r.inserted} qo'shildi, ${r.skipped} mavjud edi`);
    }
  }

  // 2) Garovni joyiga qaytaramiz.
  await reverseRefunds(studentIds, null, { apply: true });

  // 3) Guruhni arxivlaymiz (tugash sanasi) - o'chirish o'rniga to'g'ri yo'l.
  await Group.updateOne({ _id: groupDoc._id }, { $set: { endDate } });
  const live = await Group.findById(groupDoc._id);
  await groupsService.reconcileGroupEnd(live);

  // 4) Moliyani qayta hisoblaymiz (joriy chegirma/proratsiya qoidalari bilan).
  const months = await StudentPayment.find(
    { group: groupDoc._id },
    { year: 1, month: 1 },
  ).lean();
  const uniq = new Map(months.map((m) => [`${m.year}-${m.month}`, m]));
  for (const { year, month } of uniq.values()) {
    await studentPaymentService.recalcForGroupMonth(groupDoc._id, year, month);
    await teacherSalaryService.recalcForGroupMonth(groupDoc._id, year, month);
  }
  for (const sid of studentIds) await safeRecomputeStudentCompletion(sid);

  console.log(`\nTayyor: ${totalDocs} hujjat tiklandi, guruh arxivlandi.`);
  await client.close();
  await disconnectDB();
};

run().catch((err) => {
  logger.error({ err }, "Guruhni tiklash xato");
  process.exit(1);
});
