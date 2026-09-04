import mongoose from "mongoose";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import StudentDeposit from "../../../models/studentDeposit.model.js";
import Attendance from "../../../models/attendance.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import DebtSettings from "../../../models/debtSettings.model.js";
import ApiError from "../../../utils/ApiError.js";
import { localTodayMidnight } from "../../../helpers/attendance.helper.js";
import { OUTSTANDING_FILTER, remainingExpr } from "./studentPayment.service.js";
import * as depositService from "../../deposits/services/deposit.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const SETTINGS_ID = "default";

export const RISK_LEVELS = ["low", "medium", "high", "critical"];
const RISK_ORDER = { critical: 3, high: 2, medium: 1, low: 0 };

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const daysBetween = (from, to) =>
  Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / DAY_MS));

// year*12 + month (month 1-12) indeksini {year, month} ga qaytaradi.
const idxToMonth = (idx) => {
  const year = Math.floor((idx - 1) / 12);
  return { year, month: idx - year * 12 };
};

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- SOZLAMALAR (yagona hujjat) ---

export const getSettings = async () =>
  DebtSettings.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { _id: SETTINGS_ID } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

export const updateSettings = async (body) => {
  const doc = await getSettings();

  const setInt = (key, min, max, message) => {
    if (body[key] === undefined) return;
    const v = Number(body[key]);
    if (!Number.isInteger(v) || v < min || v > max) throw new ApiError(400, message);
    doc[key] = v;
  };

  setInt("graceDays", 0, 31, "Imtiyoz kunlari 0 dan 31 gacha bo'lishi kerak");
  setInt("mediumMonths", 1, 12, "O'rta xavf oylari 1 dan 12 gacha bo'lishi kerak");
  setInt("highMonths", 1, 12, "Yuqori xavf oylari 1 dan 12 gacha bo'lishi kerak");
  setInt("inactivityDays", 1, 365, "Kelmagan kunlar 1 dan 365 gacha bo'lishi kerak");
  if (body.archiveDebtLock !== undefined) doc.archiveDebtLock = !!body.archiveDebtLock;

  if (doc.highMonths < doc.mediumMonths) {
    throw new ApiError(400, "Yuqori xavf oylari o'rta xavf oylaridan kam bo'lmasligi kerak");
  }

  await doc.save();
  return doc;
};

// --- QARZDORLAR ---

// O'quvchi kesimida jamlangan qarz. view="active" - undiriladigan qoldiq,
// view="written_off" - hisobdan chiqarilgan (umidsiz) summa.
const aggregateByStudent = async (view) => {
  const match =
    view === "written_off"
      ? {
          // Amaldagi qiymat proratsiya tufayli vaqtincha 0 ga cheklangan bo'lishi
          // mumkin - bunday kechirim ham ro'yxatda ko'rinsin, aks holda uni
          // bekor qilishning yo'li qolmasdi.
          $or: [
            { writtenOffAmount: { $gt: 0 } },
            { writeOffRequested: { $gt: 0 } },
          ],
        }
      : OUTSTANDING_FILTER;
  const amount =
    view === "written_off" ? { $ifNull: ["$writtenOffAmount", 0] } : remainingExpr;

  return StudentPayment.aggregate([
    { $match: match },
    {
      $addFields: {
        amount,
        monthIdx: { $add: [{ $multiply: ["$year", 12] }, "$month"] },
      },
    },
    {
      $group: {
        _id: "$student",
        totalDebt: { $sum: "$amount" },
        // Bir o'quvchi bir oyda bir NECHTA guruhda qarzdor bo'lishi mumkin -
        // qatorlarni emas, ALOHIDA oylarni sanaymiz.
        debtMonthSet: { $addToSet: "$monthIdx" },
        oldestIdx: { $min: "$monthIdx" },
        newestIdx: { $max: "$monthIdx" },
        groupIds: { $addToSet: "$group" },
        writtenOffAt: { $max: "$writtenOffAt" },
        writeOffReason: { $last: "$writeOffReason" },
      },
    },
  ]);
};

// Xavf darajasi. Mijozning asosiy og'rig'i - "to'lamay yo'q bo'lib ketadiganlar":
// shuning uchun qarzi bor va endi darsga kelmayotgan (yoki arxivlangan, yoki
// birorta faol guruhi qolmagan) o'quvchi HAR DOIM "kritik" bo'ladi va ro'yxat
// tepasiga chiqadi - qarz necha oylik ekanidan qat'i nazar.
const computeRisk = ({
  settings,
  monthsOverdue,
  inGrace,
  isArchived,
  hasActiveGroup,
  inactiveDays,
}) => {
  if (isArchived) return { level: "critical", reason: "Arxivlangan, qarzi qolgan" };
  if (!hasActiveGroup) {
    return { level: "critical", reason: "Faol guruhi yo'q, qarzi qolgan" };
  }
  if (inactiveDays !== null && inactiveDays >= settings.inactivityDays) {
    return { level: "critical", reason: inactiveDays + " kundan beri darsga kelmagan" };
  }

  if (monthsOverdue >= settings.highMonths) {
    return { level: "high", reason: monthsOverdue + " oydan beri to'lanmagan" };
  }
  if (monthsOverdue >= settings.mediumMonths) {
    return { level: "medium", reason: monthsOverdue + " oy kechikkan" };
  }
  return {
    level: "low",
    reason: inGrace ? "Imtiyoz muddati ichida" : "Yangi qarz",
  };
};

const SORTERS = {
  debt: (a, b) => b.totalDebt - a.totalDebt,
  oldest: (a, b) => a.oldestIdx - b.oldestIdx,
  name: (a, b) =>
    (a.student.lastName + " " + a.student.firstName).localeCompare(
      b.student.lastName + " " + b.student.firstName,
      "uz",
    ),
  risk: (a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk] || b.totalDebt - a.totalDebt,
};

// Qarzdorlar ro'yxati - o'quvchi kesimida (BARCHA yil va guruhlar bo'yicha
// jamlangan), xavf darajasi, aloqa ma'lumoti va "qachondan beri kelmayapti"
// ustuni bilan. Eski /obligations endpointi oy kesimida va faqat BITTA yil
// bo'yicha edi - o'tgan yilgi qarzdor ro'yxatdan butunlay tushib qolardi.
//
// Bitta guruhlangan agregatsiya + oltita paketli (batch) so'rov - N+1 yo'q.
// Natija o'quvchi soniga teng (yuzlar tartibida), shuning uchun filtr/tartib/
// paginatsiya JS tomonida bajariladi.
export const listDebtors = async ({
  search,
  groupId,
  risk,
  archived = "all",
  view = "active",
  sort = "risk",
  page = 1,
  limit = 25,
} = {}) => {
  const settings = await getSettings();
  const [rows, offTotal] = await Promise.all([
    aggregateByStudent(view),
    writtenOffTotal(),
  ]);

  if (!rows.length) {
    return {
      items: [],
      total: 0,
      page,
      limit,
      summary: {
        totalDebt: 0,
        studentsCount: 0,
        criticalCount: 0,
        writtenOffTotal: offTotal,
      },
    };
  }

  const studentIds = rows.map((r) => r._id);
  const groupIds = [
    ...new Map(rows.flatMap((r) => r.groupIds || []).map((g) => [String(g), g])).values(),
  ];

  const [users, deposits, lastPayRows, lastAttRows, activeMems, groups] =
    await Promise.all([
      User.find(
        { _id: { $in: studentIds } },
        { firstName: 1, lastName: 1, username: 1, phone: 1, isActive: 1, archivedAt: 1 },
      ).lean(),
      StudentDeposit.find(
        { student: { $in: studentIds } },
        { student: 1, balance: 1 },
      ).lean(),
      PaymentTransaction.aggregate([
        { $match: { student: { $in: studentIds }, isDeleted: { $ne: true } } },
        { $group: { _id: "$student", lastAt: { $max: "$paidAt" } } },
      ]),
      Attendance.aggregate([
        {
          $match: {
            student: { $in: studentIds },
            status: "present",
            isDeleted: { $ne: true },
          },
        },
        { $group: { _id: "$student", lastAt: { $max: "$date" } } },
      ]),
      GroupMembership.find(
        { student: { $in: studentIds }, leftAt: null, isDeleted: { $ne: true } },
        { student: 1, group: 1 },
      ).lean(),
      Group.find({ _id: { $in: groupIds } }, { name: 1 }).lean(),
    ]);

  const userMap = new Map(users.map((u) => [String(u._id), u]));
  const depositMap = new Map(deposits.map((d) => [String(d.student), d.balance || 0]));
  const lastPayMap = new Map(lastPayRows.map((r) => [String(r._id), r.lastAt]));
  const lastAttMap = new Map(lastAttRows.map((r) => [String(r._id), r.lastAt]));
  const activeGroupSet = new Set(activeMems.map((m) => String(m.student)));
  const groupMap = new Map(groups.map((g) => [String(g._id), g.name]));

  const today = localTodayMidnight();
  const nowIdx = today.getUTCFullYear() * 12 + (today.getUTCMonth() + 1);
  const dayOfMonth = today.getUTCDate();
  // Imtiyoz muddati: oy boshidan graceDays kun ichida o'tgan oy to'lovi hali
  // "kechikkan" hisoblanmaydi, shuning uchun taqqoslash oyini bir oyga suramiz.
  const inGrace = dayOfMonth <= settings.graceDays;
  const refIdx = inGrace ? nowIdx - 1 : nowIdx;

  let items = rows.map((r) => {
    const sid = String(r._id);
    const user = userMap.get(sid) || null;
    const monthsOverdue = refIdx - r.oldestIdx;
    const lastAttendanceAt = lastAttMap.get(sid) || null;
    const inactiveDays = lastAttendanceAt ? daysBetween(lastAttendanceAt, today) : null;
    const isArchived = user ? !user.isActive : true;
    const hasActiveGroup = activeGroupSet.has(sid);
    const depositBalance = depositMap.get(sid) || 0;

    const { level, reason } = computeRisk({
      settings,
      monthsOverdue,
      inGrace,
      isArchived,
      hasActiveGroup,
      inactiveDays,
    });

    return {
      student: user
        ? {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
            phone: user.phone || "",
            isActive: !!user.isActive,
          }
        : {
            _id: r._id,
            firstName: "",
            lastName: "",
            username: "",
            phone: "",
            isActive: false,
          },
      totalDebt: r.totalDebt,
      debtMonths: (r.debtMonthSet || []).length,
      oldestDebt: idxToMonth(r.oldestIdx),
      newestDebt: idxToMonth(r.newestIdx),
      monthsOverdue,
      depositBalance,
      lastPaymentAt: lastPayMap.get(sid) || null,
      lastAttendanceAt,
      inactiveDays,
      hasActiveGroup,
      groups: (r.groupIds || [])
        .map((g) => ({ _id: g, name: groupMap.get(String(g)) || "" }))
        .filter((g) => g.name),
      risk: level,
      riskReason: reason,
      writtenOffAt: r.writtenOffAt || null,
      writeOffReason: r.writeOffReason || "",
      oldestIdx: r.oldestIdx,
    };
  });

  // --- Filtrlar ---
  if (search && search.trim()) {
    const rx = new RegExp(escapeRx(search.trim()), "i");
    items = items.filter(
      (i) =>
        rx.test(i.student.firstName + " " + i.student.lastName) ||
        rx.test(i.student.lastName + " " + i.student.firstName) ||
        rx.test(i.student.username || "") ||
        rx.test(i.student.phone || ""),
    );
  }
  if (groupId) {
    items = items.filter((i) => i.groups.some((g) => String(g._id) === String(groupId)));
  }
  if (risk) items = items.filter((i) => i.risk === risk);
  if (archived === "active") items = items.filter((i) => i.student.isActive);
  if (archived === "archived") items = items.filter((i) => !i.student.isActive);

  const summary = {
    totalDebt: items.reduce((s, i) => s + i.totalDebt, 0),
    studentsCount: items.length,
    criticalCount: items.filter((i) => i.risk === "critical").length,
    writtenOffTotal: offTotal,
  };

  items.sort(SORTERS[sort] || SORTERS.risk);

  const total = items.length;
  const start = (page - 1) * limit;
  const pageItems = items
    .slice(start, start + limit)
    .map(({ oldestIdx, ...rest }) => rest);

  return { items: pageItems, total, page, limit, summary };
};

// --- QARZNI HISOBDAN CHIQARISH (umidsiz qarz) ---

export const writtenOffTotal = async () => {
  const [row] = await StudentPayment.aggregate([
    { $match: { writtenOffAmount: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$writtenOffAmount" } } },
  ]);
  return row?.total || 0;
};

// Bitta o'quvchining BARCHA undiriladigan qoldig'ini hisobdan chiqaradi.
// expectedAmount/paidAmount tegilmaydi - faqat writtenOffAmount oshadi, shu
// sababli "qancha hisoblangan / qancha yig'ilgan" hisoboti buzilmaydi.
export const writeOff = async (studentId, { reason } = {}, currentUser) => {
  const sid = toObjectId(studentId);
  const student = await User.findById(sid, { firstName: 1, lastName: 1 }).lean();
  if (!student) throw new ApiError(404, "O'quvchi topilmadi");

  // Qarz umuman bo'lmasa - DEPOZITGA TEGMASDAN darhol xato qaytaramiz. Aks holda
  // muvaffaqiyatsiz so'rov ortidan garov allaqachon sarflangan bo'lib qolardi.
  if ((await remainingDebtFor(sid)) <= 0) {
    throw new ApiError(400, "Bu o'quvchida hisobdan chiqariladigan qarz yo'q");
  }

  // Avval depozitdagi REAL pulni qarzga qoplaymiz - hisobdan chiqarishdan oldin
  // undirilishi mumkin bo'lgan hamma narsa undirilsin. force: hisobdan chiqarish
  // ownerning ATAYLAB qilgan qarori, shuning uchun avto-qoplash to'xtatilgan
  // bo'lsa ham bajariladi - aks holda depozitdagi haqiqiy pul ishlatilmasdan
  // qarz "umidsiz" deb yozilib, o'sha pul osilib qolardi.
  const { applied: appliedFromDeposit } = await depositService.safeAutoApply(
    sid,
    currentUser,
    { force: true },
  );

  // Qoplashdan KEYINGI qoldiq - aynan shu summa kechiriladi.
  const amount = await remainingDebtFor(sid);
  if (amount <= 0) {
    return { student: sid, months: 0, amount: 0, appliedFromDeposit };
  }

  // Qolgan qoldiqni ATOMIK yozamiz: summa serverda, hujjatning JORIY qiymatlaridan
  // hisoblanadi. "O'qib ol → hisobla → yoz" bo'lganda oradagi kassa to'lovi
  // hisobdan chiqarilgan summaga qo'shilib, aslida bo'lmagan yo'qotish yozilardi.
  const remainingNow = {
    $max: [
      0,
      {
        $subtract: [
          { $ifNull: ["$expectedAmount", 0] },
          { $ifNull: ["$paidAmount", 0] },
        ],
      },
    ],
  };

  const res = await StudentPayment.updateMany(
    { student: sid, ...OUTSTANDING_FILTER },
    [
      {
        $set: {
          writtenOffAmount: remainingNow,
          // Asliy (kechirilgan) summa hech qachon kamaymaydi - proratsiya
          // qarzni vaqtincha kamaytirgan bo'lsa ham kechirim saqlanadi.
          writeOffRequested: {
            $max: [{ $ifNull: ["$writeOffRequested", 0] }, remainingNow],
          },
          writtenOffAt: new Date(),
          writtenOffBy: { $literal: currentUser?._id || null },
          // $literal SHART: agregatsiya pipeline'ida "$" bilan boshlanadigan satr
          // maydon yo'li deb talqin qilinadi - sabab matni shunday boshlansa
          // hujjatdagi boshqa maydon yozilib qolardi.
          writeOffReason: { $literal: (reason || "").trim() },
        },
      },
    ],
  );

  return {
    student: sid,
    months: res.modifiedCount || 0,
    amount,
    appliedFromDeposit,
  };
};

// Hisobdan chiqarishni bekor qiladi - qarz yana undiriladigan bo'lib qaytadi.
export const cancelWriteOff = async (studentId, currentUser) => {
  const sid = toObjectId(studentId);
  const res = await StudentPayment.updateMany(
    {
      student: sid,
      // Amaldagi qiymat proratsiya tufayli 0 ga cheklangan bo'lishi mumkin -
      // bunday yozuv ham bekor qilinishi kerak, aks holda kechirim "ko'rinmas"
      // holda qolib, qarz keyinroq qaytganda o'z-o'zidan tiklanardi.
      $or: [{ writtenOffAmount: { $gt: 0 } }, { writeOffRequested: { $gt: 0 } }],
    },
    {
      $set: {
        writtenOffAmount: 0,
        writeOffRequested: 0,
        writtenOffAt: null,
        writtenOffBy: null,
        writeOffReason: "",
      },
    },
  );
  if (!res.matchedCount) {
    throw new ApiError(400, "Bu o'quvchida hisobdan chiqarilgan qarz yo'q");
  }
  // Qarz qaytdi - depozitda pul bo'lsa darhol qoplaymiz.
  await depositService.safeAutoApply(sid, currentUser);
  return { student: sid, months: res.modifiedCount };
};

// Bitta o'quvchining undiriladigan umumiy qarzi (arxivlash qulfi shuni tekshiradi).
export const remainingDebtFor = async (studentId) => {
  const [row] = await StudentPayment.aggregate([
    { $match: { student: toObjectId(studentId) } },
    { $group: { _id: null, total: { $sum: remainingExpr } } },
  ]);
  return row?.total || 0;
};
