import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import { hashPassword } from "../helpers/password.helper.js";
import { ROLES } from "../constants/roles.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import Attendance from "../models/attendance.model.js";
import AttendanceSettings from "../models/attendanceSettings.model.js";
import AttendanceExemption from "../models/attendanceExemption.model.js";
import Feedback from "../models/feedback.model.js";
import FeedbackType from "../models/feedbackType.model.js";

// Sonlarni env orqali kichraytirsa bo'ladi (demo uchun): SEED_TEACHERS=5 ...
const TEACHER_COUNT = Number(process.env.SEED_TEACHERS) || 40;
const STUDENT_COUNT = Number(process.env.SEED_STUDENTS) || 800;
const GROUP_COUNT = Number(process.env.SEED_GROUPS) || 40;
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

  const owner = await User.findOne({ role: ROLES.OWNER });
  if (!owner) {
    throw new Error("Owner yo'q. Avval `npm run seed:owner` ishga tushiring.");
  }

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
    const dirName = DIRECTIONS[i % DIRECTIONS.length];
    const teacher = teachers[i];
    const letter = String.fromCharCode(65 + Math.floor(i / 6));
    const num = (i % 6) + 1;
    groupDocs.push({
      name: `${dirName} ${letter}-${num}`,
      schedule: genSchedule(),
      teachers: [teacher._id],
      isActive: true,
    });
  }
  const groups = await Group.insertMany(groupDocs);
  logger.info(`${groups.length} ta guruh yaratildi`);

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


  // --- Reference data for ancillary collections ---
  const feedbackTypes = await FeedbackType.find({ isActive: true });
  if (feedbackTypes.length === 0) {
    throw new Error(
      "Reference data yo'q. Avval `npm run seed:communication` ishga tushiring.",
    );
  }

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
    `Fake data tayyor (${elapsed}s): ${teachers.length} teacher, ${students.length} student, ${groups.length} group, ${memberships.length} membership, ${totalAttendance} attendance, ${feedbackDocs.length} feedback`,
  );
  logger.info(`Login parol (barcha fake userlar): ${COMMON_PASSWORD}`);
  logger.info(`Username prefiks: student_<i>_${RUN_TAG} | teacher_<i>_${RUN_TAG}`);

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Fake data seed xato");
  process.exit(1);
});
