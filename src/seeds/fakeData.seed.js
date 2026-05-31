import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import { hashPassword } from "../helpers/password.helper.js";
import { ROLES } from "../constants/roles.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import LeadDirection from "../models/leadDirection.model.js";
import PaymentMethod from "../models/paymentMethod.model.js";
import TeacherGroupRate from "../models/teacherGroupRate.model.js";
import Invoice from "../models/invoice.model.js";
import Payment from "../models/payment.model.js";
import Salary from "../models/salary.model.js";
import SalaryPayout from "../models/salaryPayout.model.js";
import Attendance from "../models/attendance.model.js";
import AttendanceSettings from "../models/attendanceSettings.model.js";
import AttendanceExemption from "../models/attendanceExemption.model.js";
import Lead from "../models/lead.model.js";
import LeadSource from "../models/leadSource.model.js";
import LeadStatus from "../models/leadStatus.model.js";
import Discount from "../models/discount.model.js";
import DiscountKind from "../models/discountKind.model.js";
import Feedback from "../models/feedback.model.js";
import FeedbackType from "../models/feedbackType.model.js";
import Expense from "../models/expense.model.js";

const TEACHER_COUNT = 40;
const STUDENT_COUNT = 800;
const GROUP_COUNT = 40;
const COMMON_PASSWORD = "parol123";
const RUN_TAG = Date.now().toString(36);
const PHONE_BASE = parseInt(RUN_TAG.slice(-6), 36) % 9000000;

const DIRECTIONS = [
  "Matematika",
  "Ingliz tili",
  "Rus tili",
  "Informatika",
  "Fizika",
  "Kimyo",
];

const MONTHS = [
  { year: 2025, month: 6 }, { year: 2025, month: 7 }, { year: 2025, month: 8 },
  { year: 2025, month: 9 }, { year: 2025, month: 10 }, { year: 2025, month: 11 },
  { year: 2025, month: 12 },
  { year: 2026, month: 1 }, { year: 2026, month: 2 }, { year: 2026, month: 3 },
  { year: 2026, month: 4 }, { year: 2026, month: 5 },
];

const MALE_FIRST = [
  "Ali", "Vali", "Akmal", "Bekzod", "Doniyor", "Sherzod", "Sardor", "Jasur",
  "Otabek", "Sirojiddin", "Husan", "Hasan", "Anvar", "Botir", "Davron", "Eldor",
  "Farrux", "Habib", "Ibrohim", "Javlon", "Karim", "Laziz", "Murod", "Nodir",
  "Olim", "Rustam", "Sanjar", "Temur", "Ulug'bek", "Yusuf",
];
const FEMALE_FIRST = [
  "Aziza", "Dilnoza", "Madina", "Nodira", "Saodat", "Zarina", "Gulnora",
  "Mohinur", "Komila", "Lola", "Maftuna", "Nilufar", "Sevara", "Zilola", "Asal",
  "Barno", "Charos", "Dilshoda", "Elnura", "Farangiz", "Gulchehra", "Hilola",
  "Iroda", "Kamola", "Latofat", "Mahliyo", "Nigora", "Rayhona", "Shahnoza",
  "Umida",
];
const LAST_NAMES = [
  "Karimov", "Olimov", "Rashidov", "Yusupov", "Hamidov", "Toshmatov", "Saidov",
  "Ergashev", "Mahmudov", "Ahmedov", "Murodov", "Rahmonov", "Tursunov",
  "Norqulov", "Sharipov", "Sodiqov", "Qodirov", "Ismoilov", "Xolmatov",
  "Mirzayev", "Abdullayev", "Boboyev", "Davlatov", "Eshmatov", "Fayziyev",
  "Hojiyev", "Komilov", "Nazarov", "Qosimov", "Rajabov", "Sobirov", "Umarov",
  "Vohidov", "Yo'ldoshev", "Zoirov", "Nematov", "Salimov", "Yo'lchiyev",
  "G'aniyev", "Po'latov",
];
const CITIES = [
  "Toshkent", "Samarqand", "Buxoro", "Andijon", "Farg'ona", "Namangan",
  "Nukus", "Qarshi", "Jizzax", "Navoiy",
];
const STREETS = [
  "Mustaqillik", "Amir Temur", "Navoiy", "Bobur", "A.Qodiriy", "Furqat",
  "Yusuf Xos Hojib", "Cho'lpon",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDate = (from, to) =>
  new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));

const weighted = (items) => {
  const total = items.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const w of items) {
    r -= w.weight;
    if (r <= 0) return w.value;
  }
  return items[items.length - 1].value;
};

const monthStart = (y, m) => new Date(y, m - 1, 1);
const monthEnd = (y, m) => new Date(y, m, 0, 23, 59, 59, 999);
const fmtTime = (h, mi) =>
  `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;

const genPhone = (idx) => {
  const op = pick(["90", "91", "93", "94", "95", "97", "99", "33"]);
  const num = String((PHONE_BASE + idx) % 10000000).padStart(7, "0");
  return `+998${op}${num}`;
};

const genUsername = (prefix, idx) => `${prefix}_${idx}_${RUN_TAG}`;

const genSchedule = () => {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat"];
  const count = randInt(2, 3);
  const picked = [...days].sort(() => Math.random() - 0.5).slice(0, count);
  const startHour = randInt(14, 18);
  return picked.map((day) => ({
    day,
    startTime: fmtTime(startHour, 0),
    endTime: fmtTime(startHour + 2, 0),
  }));
};

const bulkInsert = async (Model, docs, chunkSize = 1000) => {
  const inserted = [];
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = await Model.insertMany(docs.slice(i, i + chunkSize));
    inserted.push(...chunk);
  }
  return inserted;
};

const seed = async () => {
  await connectDB();
  const startedAt = Date.now();

  const paymentMethods = await PaymentMethod.find({ isActive: true });
  if (paymentMethods.length === 0) {
    throw new Error(
      "PaymentMethod yo'q. Avval `npm run seed:payments` ishga tushiring.",
    );
  }
  const owner = await User.findOne({ role: ROLES.OWNER });
  if (!owner) {
    throw new Error("Owner yo'q. Avval `npm run seed:owner` ishga tushiring.");
  }

  const directions = [];
  for (const name of DIRECTIONS) {
    const doc = await LeadDirection.findOneAndUpdate(
      { name, isActive: true },
      { $setOnInsert: { name, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    directions.push(doc);
  }
  logger.info(`${directions.length} ta yo'nalish tayyor`);

  const passwordHash = await hashPassword(COMMON_PASSWORD);
  const now = new Date(2026, 4, 26);
  const yearAgo = new Date(2025, 4, 26);

  const teacherDocs = [];
  for (let i = 1; i <= TEACHER_COUNT; i++) {
    const gender = Math.random() < 0.5 ? "male" : "female";
    const first = pick(gender === "male" ? MALE_FIRST : FEMALE_FIRST);
    const last = pick(LAST_NAMES);
    teacherDocs.push({
      firstName: first,
      lastName: last,
      username: genUsername("teacher", i),
      phone: genPhone(i),
      passwordHash,
      plainPassword: COMMON_PASSWORD,
      role: ROLES.TEACHER,
      gender,
      birthDate: randDate(new Date(1975, 0, 1), new Date(1995, 11, 31)),
      hiredAt: randDate(new Date(2022, 0, 1), new Date(2024, 11, 31)),
      isActive: true,
    });
  }
  const teachers = await bulkInsert(User, teacherDocs);
  logger.info(`${teachers.length} ta o'qituvchi yaratildi`);

  const studentDocs = [];
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const gender = Math.random() < 0.5 ? "male" : "female";
    const first = pick(gender === "male" ? MALE_FIRST : FEMALE_FIRST);
    const last = pick(LAST_NAMES);
    const enrolledAt =
      Math.random() < 0.7
        ? randDate(yearAgo, new Date(2025, 7, 31))
        : randDate(new Date(2025, 8, 1), now);
    studentDocs.push({
      firstName: first,
      lastName: last,
      username: genUsername("student", i),
      phone: genPhone(i + 1000),
      passwordHash,
      plainPassword: COMMON_PASSWORD,
      role: ROLES.STUDENT,
      gender,
      birthDate: randDate(new Date(2005, 0, 1), new Date(2015, 11, 31)),
      address: `${pick(CITIES)} sh., ${pick(STREETS)} ko'chasi, ${randInt(1, 200)}-uy`,
      parentName: `${pick(LAST_NAMES)} ${pick(MALE_FIRST)}`,
      parentPhone: genPhone(i + 5000),
      enrolledAt,
      isActive: true,
    });
  }
  const students = await bulkInsert(User, studentDocs);
  logger.info(`${students.length} ta o'quvchi yaratildi`);

  const groupDocs = [];
  for (let i = 0; i < GROUP_COUNT; i++) {
    const dir = directions[i % directions.length];
    const teacher = teachers[i];
    const letter = String.fromCharCode(65 + Math.floor(i / 6));
    const num = (i % 6) + 1;
    groupDocs.push({
      name: `${dir.name} ${letter}-${num}`,
      schedule: genSchedule(),
      teachers: [teacher._id],
      direction: dir._id,
      monthlyPrice: randInt(6, 16) * 50000,
      isActive: true,
    });
  }
  const groups = await Group.insertMany(groupDocs);
  logger.info(`${groups.length} ta guruh yaratildi`);

  const rateDocs = [];
  for (let i = 0; i < GROUP_COUNT; i++) {
    const teacher = teachers[i];
    const group = groups[i];
    const calcType = weighted([
      { value: "percentage", weight: 60 },
      { value: "fixed", weight: 30 },
      { value: "hourly", weight: 10 },
    ]);
    const rate = {
      teacher: teacher._id,
      group: group._id,
      calculationType: calcType,
      hoursPerSession: 2,
      effectiveFrom: yearAgo,
      isActive: true,
      createdBy: owner._id,
    };
    if (calcType === "percentage") rate.percentageRate = randInt(40, 60);
    else if (calcType === "fixed") rate.fixedAmount = randInt(40, 80) * 50000;
    else rate.hourlyRate = randInt(16, 30) * 5000;
    rateDocs.push(rate);
  }
  const rates = await TeacherGroupRate.insertMany(rateDocs);
  logger.info(`${rates.length} ta teacher-group rate yaratildi`);

  const rateByGroup = new Map();
  for (const r of rates) rateByGroup.set(String(r.group), r);

  const membershipDocs = [];
  for (const student of students) {
    const numGroups = weighted([
      { value: 1, weight: 50 },
      { value: 2, weight: 35 },
      { value: 3, weight: 15 },
    ]);
    const picked = [...groups].sort(() => Math.random() - 0.5).slice(0, numGroups);
    for (const group of picked) {
      const minJoin =
        student.enrolledAt > yearAgo ? student.enrolledAt : yearAgo;
      const joinedAt = randDate(minJoin, now);
      const hasLeft = Math.random() < 0.1;
      const leftAt = hasLeft ? randDate(joinedAt, now) : null;
      const leftReason = hasLeft
        ? pick(["graduated", "removed", "transferred"])
        : null;
      membershipDocs.push({
        group: group._id,
        student: student._id,
        joinedAt,
        leftAt,
        leftReason,
      });
    }
  }
  const memberships = await bulkInsert(GroupMembership, membershipDocs);
  logger.info(`${memberships.length} ta group membership yaratildi`);

  const groupById = new Map();
  for (const g of groups) groupById.set(String(g._id), g);

  // group-month → total payments yig'ish (oylik foiz hisobi uchun)
  const groupMonthPayments = new Map();
  let totalInvoices = 0;
  let totalPayments = 0;

  for (let mi = 0; mi < MONTHS.length; mi++) {
    const { year, month } = MONTHS[mi];
    const mStart = monthStart(year, month);
    const mEnd = monthEnd(year, month);
    const isCurrent = year === 2026 && month === 5;
    const monthsAgo = MONTHS.length - mi - 1;

    const invoicesThisMonth = [];
    for (const m of memberships) {
      if (m.joinedAt > mEnd) continue;
      if (m.leftAt && m.leftAt < mStart) continue;
      const group = groupById.get(String(m.group));
      if (!group) continue;
      const paidWeight = isCurrent ? 30 : Math.min(70 + monthsAgo * 2, 85);
      const partialWeight = 12;
      const unpaidWeight = isCurrent ? 58 : Math.max(15 - monthsAgo, 3);
      const status = weighted([
        { value: "paid", weight: paidWeight },
        { value: "partial", weight: partialWeight },
        { value: "unpaid", weight: unpaidWeight },
      ]);
      const baseAmount = group.monthlyPrice;
      let paidAmount = 0;
      if (status === "paid") paidAmount = baseAmount;
      else if (status === "partial")
        paidAmount =
          Math.floor((baseAmount * (0.3 + Math.random() * 0.5)) / 10000) * 10000;
      invoicesThisMonth.push({
        student: m.student,
        group: m.group,
        membership: m._id,
        period: { year, month },
        baseAmount,
        totalDue: baseAmount,
        paidAmount,
        status,
        dueDate: new Date(year, month - 1, 5),
        createdBy: owner._id,
      });
    }
    const inserted = await bulkInsert(Invoice, invoicesThisMonth);
    totalInvoices += inserted.length;

    const paymentsThisMonth = [];
    for (const inv of inserted) {
      if (inv.paidAmount <= 0) continue;
      const split = inv.status === "partial" && Math.random() < 0.3;
      const paidAt = randDate(mStart, mEnd);
      if (split) {
        const a1 =
          Math.floor((inv.paidAmount * (0.4 + Math.random() * 0.2)) / 10000) *
          10000;
        const a2 = inv.paidAmount - a1;
        paymentsThisMonth.push({
          invoice: inv._id,
          student: inv.student,
          amount: a1,
          type: "payment",
          method: pick(paymentMethods)._id,
          paidAt,
          receivedBy: owner._id,
        });
        if (a2 > 0) {
          paymentsThisMonth.push({
            invoice: inv._id,
            student: inv.student,
            amount: a2,
            type: "payment",
            method: pick(paymentMethods)._id,
            paidAt: randDate(paidAt, mEnd),
            receivedBy: owner._id,
          });
        }
      } else {
        paymentsThisMonth.push({
          invoice: inv._id,
          student: inv.student,
          amount: inv.paidAmount,
          type: "payment",
          method: pick(paymentMethods)._id,
          paidAt,
          receivedBy: owner._id,
        });
      }
      const k = `${String(inv.group)}-${year}-${month}`;
      groupMonthPayments.set(k, (groupMonthPayments.get(k) || 0) + inv.paidAmount);
    }
    await bulkInsert(Payment, paymentsThisMonth);
    totalPayments += paymentsThisMonth.length;
    logger.info(
      `[${year}-${String(month).padStart(2, "0")}] ${inserted.length} invoice, ${paymentsThisMonth.length} payment`,
    );
  }

  let totalSalaries = 0;
  let totalPayouts = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const { year, month } = MONTHS[mi];
    const isCurrent = year === 2026 && month === 5;
    const salariesThisMonth = [];
    for (const teacher of teachers) {
      const teacherGroups = groups.filter(
        (g) => String(g.teachers[0]) === String(teacher._id),
      );
      const breakdowns = [];
      for (const group of teacherGroups) {
        const rate = rateByGroup.get(String(group._id));
        if (!rate) continue;
        const b = {
          group: group._id,
          groupName: group.name,
          calculationType: rate.calculationType,
        };
        if (rate.calculationType === "fixed") {
          b.fixedAmount = rate.fixedAmount;
          b.subtotal = rate.fixedAmount;
        } else if (rate.calculationType === "hourly") {
          const sessions = randInt(8, 12);
          const hours = sessions * (rate.hoursPerSession || 2);
          b.sessionsCount = sessions;
          b.hoursPerSession = rate.hoursPerSession;
          b.totalHours = hours;
          b.hourlyRate = rate.hourlyRate;
          b.hourlyAmount = hours * rate.hourlyRate;
          b.subtotal = b.hourlyAmount;
        } else if (rate.calculationType === "percentage") {
          const k = `${String(group._id)}-${year}-${month}`;
          const total = groupMonthPayments.get(k) || 0;
          const amount =
            Math.floor((total * rate.percentageRate) / 100 / 1000) * 1000;
          b.studentPaymentsTotal = total;
          b.percentageRate = rate.percentageRate;
          b.percentageAmount = amount;
          b.subtotal = amount;
        }
        breakdowns.push(b);
      }
      const baseAmount = breakdowns.reduce((s, b) => s + (b.subtotal || 0), 0);

      const adjustments = [];
      let bonusTotal = 0;
      let penaltyTotal = 0;
      if (Math.random() < 0.2) {
        const isBonus = Math.random() < 0.6;
        const amount = isBonus
          ? randInt(200, 500) * 1000
          : randInt(100, 300) * 1000;
        if (isBonus) bonusTotal = amount;
        else penaltyTotal = amount;
        adjustments.push({
          type: isBonus ? "bonus" : "penalty",
          amount,
          reason: isBonus ? "Yaxshi natija" : "Kechikkanlik",
          createdBy: owner._id,
          createdAt: monthEnd(year, month),
        });
      }
      const finalAmount = Math.max(0, baseAmount + bonusTotal - penaltyTotal);
      const status = isCurrent
        ? weighted([
            { value: "calculated", weight: 70 },
            { value: "approved", weight: 25 },
            { value: "paid", weight: 5 },
          ])
        : weighted([
            { value: "paid", weight: 80 },
            { value: "approved", weight: 15 },
            { value: "calculated", weight: 5 },
          ]);
      const paidAmount = status === "paid" ? finalAmount : 0;
      salariesThisMonth.push({
        teacher: teacher._id,
        period: { year, month },
        groupBreakdowns: breakdowns,
        baseAmount,
        adjustments,
        bonusTotal,
        penaltyTotal,
        advanceTotal: 0,
        deductionTotal: 0,
        finalAmount,
        paidAmount,
        status,
        calculatedAt: monthEnd(year, month),
        calculatedBy: owner._id,
        approvedAt: status !== "calculated" ? monthEnd(year, month) : null,
        approvedBy: status !== "calculated" ? owner._id : null,
      });
    }
    const insertedSalaries = await Salary.insertMany(salariesThisMonth);
    totalSalaries += insertedSalaries.length;

    const payouts = [];
    for (const sal of insertedSalaries) {
      if (sal.status !== "paid" || sal.paidAmount <= 0) continue;
      payouts.push({
        salary: sal._id,
        teacher: sal.teacher,
        amount: sal.paidAmount,
        method: pick(paymentMethods)._id,
        paidAt: monthEnd(year, month),
        paidBy: owner._id,
      });
    }
    if (payouts.length > 0) await SalaryPayout.insertMany(payouts);
    totalPayouts += payouts.length;
  }
  logger.info(`${totalSalaries} ta salary va ${totalPayouts} ta payout yaratildi`);

  // --- Reference data for ancillary collections ---
  const leadStatuses = await LeadStatus.find({ isActive: true });
  const leadSources = await LeadSource.find({ isActive: true });
  const discountKinds = await DiscountKind.find({ isActive: true });
  const feedbackTypes = await FeedbackType.find({ isActive: true });
  if (
    leadStatuses.length === 0 ||
    leadSources.length === 0 ||
    discountKinds.length === 0 ||
    feedbackTypes.length === 0
  ) {
    throw new Error(
      "Reference data yo'q. Avval `npm run seed:leads` va `npm run seed:communication` ishga tushiring.",
    );
  }
  const initialStatus =
    leadStatuses.find((s) => s.isInitial) || leadStatuses[0];
  const convertedStatus =
    leadStatuses.find((s) => s.isConverted) ||
    leadStatuses.find((s) => s.isFinal && s.name !== "Rad etdi") ||
    leadStatuses[0];
  const rejectedStatus =
    leadStatuses.find((s) => s.isFinal && !s.isConverted) ||
    leadStatuses[leadStatuses.length - 1];

  // AttendanceSettings (singleton)
  await AttendanceSettings.findOneAndUpdate(
    { _id: "default" },
    { $setOnInsert: { _id: "default" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  logger.info("AttendanceSettings tayyor");

  // AttendanceExemption: 5% studentlarda
  const exemptionDocs = [];
  for (const student of students) {
    if (Math.random() < 0.05) {
      exemptionDocs.push({
        student: student._id,
        startDate: randDate(yearAgo, now),
        endDate: null,
        daysOfWeek: pick([[], ["fri"], ["sat"], ["fri", "sat"]]),
        reason: pick([
          "Tibbiy sabab",
          "Sport mashg'uloti",
          "Boshqa kurs",
          "Oilaviy sharoit",
        ]),
        isActive: true,
        createdBy: owner._id,
      });
    }
  }
  if (exemptionDocs.length > 0)
    await AttendanceExemption.insertMany(exemptionDocs);
  logger.info(`${exemptionDocs.length} ta attendance exemption yaratildi`);

  // Attendance: har bir guruh uchun jadval kunlarida
  const DAY_NUM_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const teacherByGroup = new Map();
  for (const g of groups) teacherByGroup.set(String(g._id), g.teachers[0]);
  const membershipsByGroupId = new Map();
  for (const m of memberships) {
    const k = String(m.group);
    if (!membershipsByGroupId.has(k)) membershipsByGroupId.set(k, []);
    membershipsByGroupId.get(k).push(m);
  }

  let totalAttendance = 0;
  for (const group of groups) {
    const scheduleDays = new Set(group.schedule.map((s) => s.day));
    const groupMembers = membershipsByGroupId.get(String(group._id)) || [];
    if (groupMembers.length === 0) continue;
    const teacherId = teacherByGroup.get(String(group._id));

    const docs = [];
    const cursor = new Date(yearAgo);
    while (cursor <= now) {
      const dayKey = DAY_NUM_TO_KEY[cursor.getDay()];
      if (scheduleDays.has(dayKey)) {
        const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        for (const m of groupMembers) {
          if (m.joinedAt > cursor) continue;
          if (m.leftAt && m.leftAt < cursor) continue;
          const status = weighted([
            { value: "present", weight: 87 },
            { value: "absent", weight: 8 },
            { value: "excused", weight: 4 },
            { value: "exempt", weight: 1 },
          ]);
          const doc = {
            group: group._id,
            student: m.student,
            date: new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate(),
              17,
            ),
            dateKey,
            status,
            recordedBy: teacherId,
            source: "teacher",
            recordedAt: new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate(),
              20,
            ),
          };
          if (status === "excused")
            doc.reason = pick([
              "Kasallik",
              "Oilaviy sabab",
              "Tibbiy ko'rik",
              "Boshqa kurs",
            ]);
          docs.push(doc);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (docs.length > 0) {
      await bulkInsert(Attendance, docs, 5000);
      totalAttendance += docs.length;
    }
  }
  logger.info(`${totalAttendance} ta davomat yozuvi yaratildi`);

  // Discount: ~10% studentlarda
  const discountDocs = [];
  for (const student of students) {
    if (Math.random() < 0.1) {
      const kind = pick(discountKinds);
      const valueType = Math.random() < 0.7 ? "percent" : "amount";
      const value =
        valueType === "percent" ? randInt(5, 30) : randInt(50, 200) * 1000;
      discountDocs.push({
        student: student._id,
        kind: kind._id,
        valueType,
        value,
        reason: `${kind.name} chegirma`,
        startDate: student.enrolledAt || yearAgo,
        endDate: null,
        isActive: true,
      });
    }
  }
  if (discountDocs.length > 0) await Discount.insertMany(discountDocs);
  logger.info(`${discountDocs.length} ta chegirma yaratildi`);

  // Lead: ~200 lid
  const LEAD_FIRST_NAMES = [...MALE_FIRST, ...FEMALE_FIRST];
  const leadDocs = [];
  for (let i = 0; i < 200; i++) {
    const first = pick(LEAD_FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const status = weighted([
      { value: initialStatus, weight: 35 },
      { value: leadStatuses[Math.min(1, leadStatuses.length - 1)], weight: 25 },
      { value: leadStatuses[Math.min(2, leadStatuses.length - 1)], weight: 15 },
      { value: leadStatuses[Math.min(3, leadStatuses.length - 1)], weight: 10 },
      { value: convertedStatus, weight: 10 },
      { value: rejectedStatus, weight: 5 },
    ]);
    const requestDate = randDate(yearAgo, now);
    const isConverted =
      status._id.toString() === convertedStatus._id.toString();
    const isRejected = status._id.toString() === rejectedStatus._id.toString();
    const lead = {
      firstName: first,
      lastName: last,
      phone: genPhone(i + 9000),
      birthDate: randDate(new Date(2003, 0, 1), new Date(2015, 11, 31)),
      source: pick(leadSources)._id,
      direction: pick(directions)._id,
      status: status._id,
      assignedTo: pick(teachers)._id,
      requestDate,
      contactCount: randInt(0, 5),
      lastContactAt: requestDate,
      createdBy: owner._id,
    };
    if (isConverted) {
      const matched = pick(students);
      lead.convertedUser = matched._id;
      lead.convertedAt = randDate(requestDate, now);
    }
    if (isRejected) {
      lead.rejectionReason = pick(["price", "time", "other_center", "other"]);
      lead.rejectionNote = "Avtomatik fake data";
    }
    if (Math.random() < 0.3) {
      lead.trialDate = randDate(requestDate, now);
      lead.trialGroup = pick(groups)._id;
    }
    if (Math.random() < 0.2) {
      lead.followUpDate = randDate(now, new Date(2026, 6, 30));
      lead.followUpNote = "Keyingi haftada qayta bog'lanish";
    }
    leadDocs.push(lead);
  }
  await Lead.insertMany(leadDocs);
  logger.info(`${leadDocs.length} ta lid yaratildi`);

  // Expense: 12 oy davomida har oy ijara, kommunal, reklama + ad-hoc
  const expenseDocs = [];
  for (const { year, month } of MONTHS) {
    const mStart = monthStart(year, month);
    const mEnd = monthEnd(year, month);
    expenseDocs.push({
      category: "rent",
      amount: 10_000_000,
      date: new Date(year, month - 1, 1),
      description: `${year}-${String(month).padStart(2, "0")} oy uchun ijara`,
      createdBy: owner._id,
    });
    expenseDocs.push({
      category: "utility",
      amount: randInt(120, 220) * 10000,
      date: new Date(year, month - 1, 10),
      description: "Kommunal to'lov (svet, suv, internet)",
      createdBy: owner._id,
    });
    expenseDocs.push({
      category: "ads",
      amount: randInt(20, 50) * 100000,
      date: randDate(mStart, mEnd),
      description: pick([
        "Instagram reklama",
        "Telegram kanal reklama",
        "Bannerlar",
        "Targetlangan reklama",
      ]),
      createdBy: owner._id,
    });
    if (Math.random() < 0.5) {
      expenseDocs.push({
        category: "other",
        amount: randInt(30, 150) * 10000,
        date: randDate(mStart, mEnd),
        description: pick([
          "Kanslyariya tovarlari",
          "Texnika ta'mirlash",
          "Mehmonlar uchun choy-qahva",
          "Bayram tadbirlari",
        ]),
        createdBy: owner._id,
      });
    }
  }
  await Expense.insertMany(expenseDocs);
  logger.info(`${expenseDocs.length} ta xarajat yaratildi`);

  // Feedback: 80 ta
  const feedbackDocs = [];
  const FB_MESSAGES = [
    "O'qituvchi juda yaxshi tushuntiradi, rahmat!",
    "Dars vaqtini biroz ertaroq qilsangiz yaxshi bo'lardi.",
    "Guruhda o'quvchilar soni biroz ko'p, e'tibor kam.",
    "Yangi mavzular qiziqarli, lekin uy vazifalari ko'p.",
    "Markazning sharoiti yoqdi, ammo internet sekin.",
    "To'lov muddatini uzaytira olasizmi? Sharoit yo'q.",
    "Sinov darsi yaxshi o'tdi, hammasi mukammal.",
    "Boshqa guruhga o'tkazsangiz iltimos, vaqt to'g'ri kelmayapti.",
  ];
  for (let i = 0; i < 80; i++) {
    const author = pick(students);
    const isAnon = Math.random() < 0.2;
    const status = weighted([
      { value: "new", weight: 30 },
      { value: "in_review", weight: 20 },
      { value: "resolved", weight: 40 },
      { value: "rejected", weight: 10 },
    ]);
    const fb = {
      author: isAnon ? null : author._id,
      authorRoleSnapshot: isAnon ? "" : "student",
      isAnonymous: isAnon,
      type: pick(feedbackTypes)._id,
      group: Math.random() < 0.5 ? pick(groups)._id : null,
      message: pick(FB_MESSAGES),
      status,
    };
    if (status === "in_review" || status === "resolved" || status === "rejected") {
      fb.reviewedBy = owner._id;
      fb.reviewedAt = randDate(yearAgo, now);
    }
    if (status === "resolved") {
      fb.resolvedBy = owner._id;
      fb.resolvedAt = randDate(yearAgo, now);
      fb.adminReply = "Murojaatingiz uchun rahmat, ko'rib chiqildi.";
      fb.repliedBy = owner._id;
      fb.repliedAt = fb.resolvedAt;
    }
    if (status === "rejected") {
      fb.rejectionReason = "Murojaat asossiz";
    }
    feedbackDocs.push(fb);
  }
  await Feedback.insertMany(feedbackDocs);
  logger.info(`${feedbackDocs.length} ta fikr-mulohaza yaratildi`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `Fake data tayyor (${elapsed}s): ${teachers.length} teacher, ${students.length} student, ${groups.length} group, ${memberships.length} membership, ${totalInvoices} invoice, ${totalPayments} payment, ${totalSalaries} salary, ${totalPayouts} payout, ${totalAttendance} attendance, ${leadDocs.length} lead, ${expenseDocs.length} expense, ${discountDocs.length} discount, ${feedbackDocs.length} feedback`,
  );
  logger.info(`Login parol (barcha fake userlar): ${COMMON_PASSWORD}`);
  logger.info(`Username prefiks: student_<i>_${RUN_TAG} | teacher_<i>_${RUN_TAG}`);

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Fake data seed xato");
  process.exit(1);
});
