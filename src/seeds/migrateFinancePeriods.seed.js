import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import TeacherSalary from "../models/teacherSalary.model.js";
import TeacherSalaryConfig from "../models/teacherSalaryConfig.model.js";
import TeacherSalaryRatePeriod from "../models/teacherSalaryRatePeriod.model.js";
import { localTodayMidnight } from "../helpers/attendance.helper.js";
import { monthToIndex, indexToMonth } from "../helpers/period.helper.js";

// Bir martalik migratsiya: eski OYLIK TeacherSalary (+Config) tarixidan o'qituvchi
// maosh STAVKA davrlarini (TeacherSalaryRatePeriod) qayta tiklaydi. Ketma-ket bir
// xil (tutash) qiymatli oylar bitta davrga yig'iladi; oxirgi davr ochiq (end=null).
// (Guruh narxi DAVR ishlatmaydi - har oy alohida GroupFee carry-forward bilan.)
// Idempotent: davrlar allaqachon bor scope'lar o'tkazib yuboriladi.

// Tutash + bir xil "kalit" ga ega oylarni davrlarga yig'adi.
const buildRuns = (rows, keyOf) => {
  const runs = [];
  let cur = null;
  for (const r of rows) {
    if (cur && keyOf(cur.payload) === keyOf(r.payload) && r.ym === cur.lastYm + 1) {
      cur.lastYm = r.ym;
    } else {
      if (cur) runs.push(cur);
      cur = { startYm: r.ym, lastYm: r.ym, payload: r.payload };
    }
  }
  if (cur) runs.push(cur);
  return runs;
};

const migrateSalaryRates = async () => {
  const pairs = await TeacherSalary.aggregate([
    { $group: { _id: { teacher: "$teacher", group: "$group" } } },
  ]);
  let created = 0;
  let skipped = 0;
  const seen = new Set();

  for (const { _id } of pairs) {
    const { teacher, group } = _id;
    seen.add(`${teacher}:${group}`);
    const has = await TeacherSalaryRatePeriod.findOne({ teacher, group }).lean();
    if (has) {
      skipped += 1;
      continue;
    }
    const sals = await TeacherSalary.find(
      { teacher, group },
      { year: 1, month: 1, salaryType: 1, fixedAmount: 1, percentRate: 1 },
    )
      .sort({ year: 1, month: 1 })
      .lean();
    const rows = sals.map((s) => ({
      ym: monthToIndex(s.year, s.month),
      payload: {
        salaryType: s.salaryType || "fixed",
        fixedAmount: s.fixedAmount || 0,
        percentRate: s.percentRate || 0,
      },
    }));
    const runs = buildRuns(
      rows,
      (p) => `${p.salaryType}:${p.fixedAmount}:${p.percentRate}`,
    );
    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      const start = indexToMonth(run.startYm);
      const isLast = i === runs.length - 1;
      const end = isLast ? null : indexToMonth(run.lastYm);
      await TeacherSalaryRatePeriod.create({
        teacher,
        group,
        salaryType: run.payload.salaryType,
        fixedAmount: run.payload.fixedAmount,
        percentRate: run.payload.percentRate,
        startYear: start.year,
        startMonth: start.month,
        endYear: end ? end.year : null,
        endMonth: end ? end.month : null,
      });
      created += 1;
    }
  }

  // Faqat config bor (oylik maosh yozuvi yo'q) juftliklar: joriy oydan ochiq davr.
  const today = localTodayMidnight();
  const curY = today.getUTCFullYear();
  const curM = today.getUTCMonth() + 1;
  const configs = await TeacherSalaryConfig.find({}).lean();
  for (const c of configs) {
    const key = `${c.teacher}:${c.group}`;
    if (seen.has(key)) continue;
    const has = await TeacherSalaryRatePeriod.findOne({
      teacher: c.teacher,
      group: c.group,
    }).lean();
    if (has) {
      skipped += 1;
      continue;
    }
    await TeacherSalaryRatePeriod.create({
      teacher: c.teacher,
      group: c.group,
      salaryType: c.salaryType,
      fixedAmount: c.fixedAmount,
      percentRate: c.percentRate,
      startYear: curY,
      startMonth: curM,
      endYear: null,
      endMonth: null,
    });
    created += 1;
  }

  logger.info({ pairs: pairs.length, created, skipped }, "TeacherSalaryRatePeriod migratsiya");
};

const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();
  await migrateSalaryRates();
  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`Maosh stavkasi davrlari migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "Maosh stavkasi davrlari migratsiya xato");
  process.exit(1);
});
