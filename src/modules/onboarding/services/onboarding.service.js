import mongoose from "mongoose";
import Group from "../../../models/group.model.js";
import GroupFee from "../../../models/groupFee.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import Discount from "../../../models/discount.model.js";
import User from "../../../models/user.model.js";
import ImportBatch from "../../../models/importBatch.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { normalizePhone } from "../../../utils/phone.js";
import { hashPassword } from "../../../helpers/password.helper.js";
import {
  toUtcMidnight,
  localTodayMidnight,
} from "../../../helpers/attendance.helper.js";
import { computePaymentSnapshot, deriveStatus } from "../../finance/services/proration.helper.js";
import { monthKey, elapsedMonths as elapsedMonthsRaw, historicalPaidAt } from "./onboarding.helper.js";

// ── Sana yordamchilari ───────────────────────────────────────────────────────

// Pure helper'ni bugungi sana bilan o'raydi (default now).
const elapsedMonths = (startDate, now = localTodayMidnight()) =>
  elapsedMonthsRaw(startDate, now);

// ── Server tomonida validatsiya (klient bilan oyna-oyna) ────────────────────

// Har bir qatorni tekshiradi va xato bo'lsa per-row details to'playdi. Hech narsa
// yozilmasdan oldin chaqiriladi - aks holda yarim import bo'lib qolardi.
const validatePayload = async (body) => {
  const errors = [];
  const { group, students } = body;

  const today = localTodayMidnight();
  const start = toUtcMidnight(group.startDate);

  // Guruh boshlanish sanasi kelajakda bo'lmasligi kerak (onboarding = o'tmish).
  if (start.getTime() > today.getTime()) {
    errors.push({
      path: "group.startDate",
      message: "Guruh boshlanish sanasi kelajakda bo'lishi mumkin emas",
    });
  }

  const validMonths = new Set(
    elapsedMonths(group.startDate, today).map((m) => monthKey(m.year, m.month)),
  );

  // Dublikat aniqlash uchun: payloaddagi telefon/username takrorlanmasin.
  const seenPhones = new Map();
  const seenUsernames = new Map();
  // Mavjud DB bilan to'qnashuvni bitta so'rovda tekshirish uchun yig'amiz.
  const phonesToCheck = [];
  const usernamesToCheck = [];

  students.forEach((row, idx) => {
    const base = `students.${idx}`;
    const linking = !!row.existingStudentId;

    // joinDate guruh boshlanishidan oldin bo'lmasligi kerak + kelajakda emas.
    const join = toUtcMidnight(row.joinDate);
    if (join.getTime() < start.getTime()) {
      errors.push({
        path: `${base}.joinDate`,
        message: "Qo'shilgan sana guruh boshlanishidan oldin bo'lishi mumkin emas",
      });
    }
    if (join.getTime() > today.getTime()) {
      errors.push({
        path: `${base}.joinDate`,
        message: "Qo'shilgan sana kelajakda bo'lishi mumkin emas",
      });
    }

    if (!linking) {
      // Telefon formati
      const phone = normalizePhone(row.phone);
      if (!phone) {
        errors.push({ path: `${base}.phone`, message: "Telefon raqam noto'g'ri" });
      } else {
        if (seenPhones.has(phone)) {
          errors.push({
            path: `${base}.phone`,
            message: `Telefon ${idx + 1}-qatorda takrorlangan (${seenPhones.get(phone) + 1}-qator bilan)`,
          });
        } else {
          seenPhones.set(phone, idx);
          phonesToCheck.push({ phone, idx });
        }
      }
      const uname = String(row.username).toLowerCase();
      if (seenUsernames.has(uname)) {
        errors.push({
          path: `${base}.username`,
          message: `Username takrorlangan (${seenUsernames.get(uname) + 1}-qator bilan)`,
        });
      } else {
        seenUsernames.set(uname, idx);
        usernamesToCheck.push({ uname, idx });
      }
    }

    // To'lov oylari guruhning o'tgan oylariga tegishli bo'lishi shart.
    row.payments.forEach((cell, ci) => {
      const k = monthKey(cell.year, cell.month);
      if (!validMonths.has(k)) {
        errors.push({
          path: `${base}.payments.${ci}`,
          message: `${cell.month}/${cell.year} guruhning o'tgan oylaridan emas`,
        });
      }
      // To'lov oyi o'quvchi qo'shilgan oydan oldin bo'lmasligi kerak.
      if (k < monthKey(join.getUTCFullYear(), join.getUTCMonth() + 1)) {
        errors.push({
          path: `${base}.payments.${ci}`,
          message: "To'lov o'quvchi qo'shilgan oydan oldin bo'lishi mumkin emas",
        });
      }
    });
  });

  // DB'dagi mavjud foydalanuvchilar bilan to'qnashuv (dublikat ogohlantirish →
  // bu bosqichda xato: klient avval "link existing" taklif qilgan bo'lishi kerak).
  const phoneList = phonesToCheck.map((p) => normalizePhone(p.phone)).filter(Boolean);
  const unameList = usernamesToCheck.map((u) => u.uname);
  if (phoneList.length || unameList.length) {
    const clashes = await User.find(
      {
        isDeleted: { $ne: true },
        $or: [
          phoneList.length ? { phone: { $in: phoneList } } : null,
          unameList.length ? { username: { $in: unameList } } : null,
        ].filter(Boolean),
      },
      { phone: 1, username: 1 },
    ).lean();
    const clashPhones = new Set(clashes.map((c) => c.phone).filter(Boolean));
    const clashUnames = new Set(clashes.map((c) => c.username).filter(Boolean));
    for (const { phone, idx } of phonesToCheck) {
      const np = normalizePhone(phone);
      if (np && clashPhones.has(np)) {
        errors.push({
          path: `students.${idx}.phone`,
          message: "Bu telefon bilan o'quvchi allaqachon mavjud - 'mavjudni bog'lash'ni tanlang",
        });
      }
    }
    for (const { uname, idx } of usernamesToCheck) {
      if (clashUnames.has(uname)) {
        errors.push({
          path: `students.${idx}.username`,
          message: "Bu username band - boshqasini tanlang",
        });
      }
    }
  }

  // Mavjud o'quvchini bog'lashda - haqiqatan o'quvchi ekanini tekshiramiz.
  for (let idx = 0; idx < students.length; idx += 1) {
    const row = students[idx];
    if (!row.existingStudentId) continue;
    if (!mongoose.isValidObjectId(row.existingStudentId)) {
      errors.push({ path: `students.${idx}.existingStudentId`, message: "Noto'g'ri o'quvchi ID" });
      continue;
    }
    const exists = await User.exists({
      _id: row.existingStudentId,
      role: ROLES.STUDENT,
      isDeleted: { $ne: true },
    });
    if (!exists) {
      errors.push({ path: `students.${idx}.existingStudentId`, message: "Bog'lanayotgan o'quvchi topilmadi" });
    }
  }

  // Teacher ixtiyoriy - berilsa tekshiramiz.
  if (group.teacherId) {
    if (!mongoose.isValidObjectId(group.teacherId)) {
      errors.push({ path: "group.teacherId", message: "Noto'g'ri o'qituvchi ID" });
    } else {
      const okTeacher = await User.exists({
        _id: group.teacherId,
        role: ROLES.TEACHER,
        isActive: true,
        isDeleted: { $ne: true },
      });
      if (!okTeacher) errors.push({ path: "group.teacherId", message: "O'qituvchi topilmadi" });
    }
  }

  if (errors.length) {
    throw new ApiError(422, "Ba'zi qatorlarda xatolar bor", {
      code: "IMPORT_ROW_ERRORS",
      details: errors,
    });
  }
};

// ── Bitta partiyani DB'ga yozadi (tranzaksiya ICHIDA) ───────────────────────

// session berilsa shu sessiya ichida (atomik) ishlaydi; berilmasa (standalone
// Mongo fallback) sessiyasiz - rollback createdIds orqali qo'lda qilinadi.
const performImport = async (body, currentUser, batch, session) => {
  const opts = session ? { session } : {};
  const importedAt = new Date();
  const { group: g, students } = body;

  // 1) Guruh
  const [group] = await Group.create(
    [
      {
        name: g.name.trim(),
        schedule: (g.schedule || []).map((s) => ({
          day: s.day,
          startTime: s.startTime,
          endTime: s.endTime,
          effectiveFrom: null,
        })),
        teachers: g.teacherId ? [g.teacherId] : [],
        startDate: toUtcMidnight(g.startDate),
        durationMonths: g.durationMonths,
        imported: true,
        importedAt,
      },
    ],
    opts,
  );

  // 2) Har bir o'tgan oy uchun guruh tarifi (GroupFee = monthlyPrice).
  //    effectiveFrom guruh boshlanish sanasi bo'lgan oyda - o'sha kundan; aks
  //    holda butun oy. Shunda boshlanish oyi proratsiyalanadi (real holat).
  const months = elapsedMonths(g.startDate, localTodayMidnight());
  const startUtc = toUtcMidnight(g.startDate);
  for (const m of months) {
    const isStartMonth =
      m.year === startUtc.getUTCFullYear() && m.month === startUtc.getUTCMonth() + 1;
    await GroupFee.create(
      [
        {
          group: group._id,
          year: m.year,
          month: m.month,
          amount: g.monthlyPrice,
          // Boshlanish oyida tarif o'sha kundan kuchga kiradi (proratsiya uchun).
          effectiveFrom: isStartMonth ? startUtc : null,
          source: "manual",
          createdBy: currentUser?._id || null,
        },
      ],
      opts,
    );
  }

  const summary = {
    studentsCreated: 0,
    studentsLinked: 0,
    paymentsCreated: 0,
    transactionsCreated: 0,
    totalCollected: 0,
  };
  const perStudent = [];

  for (const row of students) {
    let studentId;
    if (row.existingStudentId) {
      studentId = new mongoose.Types.ObjectId(String(row.existingStudentId));
      summary.studentsLinked += 1;
    } else {
      const phone = normalizePhone(row.phone);
      const passwordHash = await hashPassword(row.password);
      const [user] = await User.create(
        [
          {
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            username: String(row.username).toLowerCase().trim(),
            phone: phone || undefined,
            passwordHash,
            role: ROLES.STUDENT,
            isActive: true,
            enrolledAt: toUtcMidnight(row.joinDate),
            imported: true,
            importedAt,
          },
        ],
        opts,
      );
      studentId = user._id;
      summary.studentsCreated += 1;
    }

    // A'zolik (joinDate bo'yicha).
    const joinedAt = toUtcMidnight(row.joinDate);
    const [membership] = await GroupMembership.create(
      [
        {
          group: group._id,
          student: studentId,
          joinedAt,
          imported: true,
          importedAt,
        },
      ],
      opts,
    );

    // Individual narx override → fixed chegirma sifatida (guruh narxi - override).
    // Override < monthlyPrice bo'lsa farqi doimiy chegirma bo'lib yoziladi.
    if (
      row.priceOverride != null &&
      row.priceOverride !== g.monthlyPrice &&
      row.priceOverride < g.monthlyPrice
    ) {
      await Discount.create(
        [
          {
            student: studentId,
            group: group._id,
            type: "fixed",
            value: g.monthlyPrice - row.priceOverride,
            scope: "permanent",
            reason: "Import: individual narx",
            isActive: true,
            createdBy: currentUser?._id || null,
          },
        ],
        opts,
      );
    }

    // Har bir o'tgan oy uchun StudentPayment (expected) - snapshotni proration
    // helper bilan (mavjud finance mantiqi) hisoblaymiz. Faqat o'quvchi a'zo
    // bo'lgan oylar (joinedAt..bugun) yoziladi.
    const studentMonths = months.filter(
      (m) => monthKey(m.year, m.month) >= monthKey(joinedAt.getUTCFullYear(), joinedAt.getUTCMonth() + 1),
    );

    const effectivePrice = row.priceOverride != null ? row.priceOverride : g.monthlyPrice;
    let studentCollected = 0;
    let studentExpected = 0;
    const paidByKey = new Map(row.payments.map((c) => [monthKey(c.year, c.month), c]));

    for (const m of studentMonths) {
      const isStartMonth =
        m.year === startUtc.getUTCFullYear() && m.month === startUtc.getUTCMonth() + 1;
      // Snapshot: baseFee = guruh narxi, chegirma = (narx - override) farqi.
      const discounts =
        effectivePrice < g.monthlyPrice
          ? [{ type: "fixed", value: g.monthlyPrice - effectivePrice }]
          : [];
      const snap = computePaymentSnapshot({
        baseFee: g.monthlyPrice,
        year: m.year,
        month: m.month,
        joinedAt,
        leftAt: null,
        freezes: [],
        discounts,
        effectiveFrom: isStartMonth ? startUtc : null,
      });

      const cell = paidByKey.get(monthKey(m.year, m.month));
      const paidAmount = cell ? cell.amount : 0;

      const [payment] = await StudentPayment.create(
        [
          {
            student: studentId,
            group: group._id,
            membership: membership._id,
            year: m.year,
            month: m.month,
            baseFee: snap.baseFee,
            prorationFactor: snap.prorationFactor,
            discountApplied: snap.discountApplied,
            expectedAmount: snap.expectedAmount,
            paidAmount,
            status: deriveStatus(paidAmount, snap.expectedAmount),
            recalculatedAt: new Date(),
            imported: true,
            importedAt,
          },
        ],
        opts,
      );
      studentExpected += snap.expectedAmount;
      summary.paymentsCreated += 1;

      // To'langan katakcha → tarixiy PaymentTransaction (paidAt = o'sha oy).
      if (cell) {
        // Tarixiy to'lov sanasi: oy 1-kuni (boshlanish oyida joinedAt kuni).
        const paidAt = historicalPaidAt(m.year, m.month, joinedAt);
        await PaymentTransaction.create(
          [
            {
              payment: payment._id,
              student: studentId,
              group: group._id,
              year: m.year,
              month: m.month,
              amount: cell.amount,
              method: cell.method || "cash",
              paidAt,
              note: "Tarixiy import",
              imported: true,
              importedAt,
              importBatch: batch._id,
              createdBy: currentUser?._id || null,
            },
          ],
          opts,
        );
        studentCollected += cell.amount;
        summary.transactionsCreated += 1;
        summary.totalCollected += cell.amount;
      }
    }

    perStudent.push({
      student: studentId,
      collected: studentCollected,
      expected: studentExpected,
      debt: Math.max(0, studentExpected - studentCollected),
    });
  }

  return { group, summary, perStudent };
};

// ── Asosiy kirish nuqtasi: idempotent + atomik import ────────────────────────

export const importExisting = async (body, currentUser) => {
  // 1) Idempotentlik: avval batch yozuvini band qilamiz. Takror kalit → E11000.
  let batch;
  try {
    batch = await ImportBatch.create({
      idempotencyKey: body.idempotencyKey,
      status: "pending",
      createdBy: currentUser?._id || null,
    });
  } catch (err) {
    if (err?.code === 11000) {
      // Allaqachon (yoki ayni damda) shu kalit bilan import bo'lgan.
      const existing = await ImportBatch.findOne({ idempotencyKey: body.idempotencyKey });
      if (existing && existing.status === "completed") {
        return { ...existing.result, duplicate: true };
      }
      // pending (parallel so'rov hali tugamagan) yoki failed → konflikt.
      throw new ApiError(
        409,
        "Bu import allaqachon bajarilmoqda yoki bajarilgan",
        { code: "IMPORT_IN_PROGRESS" },
      );
    }
    throw err;
  }

  // 2) Validatsiya (hech narsa yozilmasdan oldin) - per-row errorlar bilan.
  try {
    await validatePayload(body);
  } catch (err) {
    // Validatsiya o'tmasa - band qilingan batch'ni olib tashlaymiz (kalit bo'shaydi,
    // owner tuzatib qayta yuborishi mumkin).
    await ImportBatch.deleteOne({ _id: batch._id }).catch(() => {});
    throw err;
  }

  // 3) Atomik yozuv: Mongo replica set bo'lsa tranzaksiya; aks holda sequential.
  let result;
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    result = await performImport(body, currentUser, batch, session);
    // Batch'ni shu tranzaksiyada yakunlaymiz - hammasi birga commit bo'ladi.
    await ImportBatch.updateOne(
      { _id: batch._id },
      {
        $set: {
          status: "completed",
          group: result.group._id,
          summary: result.summary,
          result: buildResult(result),
        },
      },
      { session },
    );
    await session.commitTransaction();
    session.endSession();
    return { ...buildResult(result), duplicate: false };
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        /* noop */
      }
      session.endSession();
    }
    // Standalone Mongo (tranzaksiya qo'llab-quvvatlanmaydi) - sequential fallback.
    const txnUnsupported =
      err?.code === 20 ||
      /Transaction numbers|replica set|Transactions are not supported/i.test(err?.message || "");
    if (!txnUnsupported) {
      // Haqiqiy xato - band qilingan batch'ni tozalaymiz va xatoni qaytaramiz.
      await ImportBatch.deleteOne({ _id: batch._id }).catch(() => {});
      throw err;
    }
    return sequentialFallback(body, currentUser, batch);
  }
};

// Natija obyektini (klient + saqlash uchun) shakllantiradi.
const buildResult = ({ group, summary, perStudent }) => ({
  group: { _id: group._id, name: group.name, startDate: group.startDate },
  summary,
  students: perStudent,
});

// Tranzaksiyasiz (standalone) rejim: sessiyasiz yozamiz, xato bo'lsa qo'lda
// rollback (yaratilgan barcha yozuvlarni o'chiramiz) - "all-or-nothing" saqlanadi.
const sequentialFallback = async (body, currentUser, batch) => {
  const created = {
    groups: [],
    users: [],
    memberships: [],
    payments: [],
    transactions: [],
    discounts: [],
  };
  // performImport ichidagi create'lar created'ni to'ldirishi uchun trackerni
  // models'ga emas - bu yerda alohida yo'l bilan kuzatamiz: oddiy qayta yozuv.
  try {
    const result = await performImportTracked(body, currentUser, batch, created);
    await ImportBatch.updateOne(
      { _id: batch._id },
      { $set: { status: "completed", group: result.group._id, summary: result.summary, result: buildResult(result) } },
    );
    return { ...buildResult(result), duplicate: false };
  } catch (err) {
    logger.warn({ err }, "Onboarding import sequential fallback - rollback qilinmoqda");
    // Teskari tartibda o'chiramiz (bog'liqliklar uchun).
    await PaymentTransaction.deleteMany({ _id: { $in: created.transactions } }).catch(() => {});
    await StudentPayment.deleteMany({ _id: { $in: created.payments } }).catch(() => {});
    await Discount.deleteMany({ _id: { $in: created.discounts } }).catch(() => {});
    await GroupMembership.deleteMany({ _id: { $in: created.memberships } }).catch(() => {});
    await User.deleteMany({ _id: { $in: created.users } }).catch(() => {});
    await GroupFee.deleteMany({ group: { $in: created.groups } }).catch(() => {});
    await Group.deleteMany({ _id: { $in: created.groups } }).catch(() => {});
    await ImportBatch.deleteOne({ _id: batch._id }).catch(() => {});
    throw err;
  }
};

// performImport bilan bir xil mantiq, lekin sessiyasiz va yaratilgan id'larni
// `created` ga yig'adi (rollback uchun). Kod takrori - DRY o'rniga aniqlik:
// transaction yo'li (asosiy) toza qoladi, fallback alohida o'qiladi.
const performImportTracked = async (body, currentUser, batch, created) => {
  const importedAt = new Date();
  const { group: g, students } = body;

  const group = await Group.create({
    name: g.name.trim(),
    schedule: (g.schedule || []).map((s) => ({
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      effectiveFrom: null,
    })),
    teachers: g.teacherId ? [g.teacherId] : [],
    startDate: toUtcMidnight(g.startDate),
    durationMonths: g.durationMonths,
    imported: true,
    importedAt,
  });
  created.groups.push(group._id);

  const months = elapsedMonths(g.startDate, localTodayMidnight());
  const startUtc = toUtcMidnight(g.startDate);
  for (const m of months) {
    const isStartMonth =
      m.year === startUtc.getUTCFullYear() && m.month === startUtc.getUTCMonth() + 1;
    await GroupFee.create({
      group: group._id,
      year: m.year,
      month: m.month,
      amount: g.monthlyPrice,
      effectiveFrom: isStartMonth ? startUtc : null,
      source: "manual",
      createdBy: currentUser?._id || null,
    });
  }

  const summary = {
    studentsCreated: 0,
    studentsLinked: 0,
    paymentsCreated: 0,
    transactionsCreated: 0,
    totalCollected: 0,
  };
  const perStudent = [];

  for (const row of students) {
    let studentId;
    if (row.existingStudentId) {
      studentId = new mongoose.Types.ObjectId(String(row.existingStudentId));
      summary.studentsLinked += 1;
    } else {
      const phone = normalizePhone(row.phone);
      const passwordHash = await hashPassword(row.password);
      const user = await User.create({
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        username: String(row.username).toLowerCase().trim(),
        phone: phone || undefined,
        passwordHash,
        role: ROLES.STUDENT,
        isActive: true,
        enrolledAt: toUtcMidnight(row.joinDate),
        imported: true,
        importedAt,
      });
      studentId = user._id;
      created.users.push(user._id);
      summary.studentsCreated += 1;
    }

    const joinedAt = toUtcMidnight(row.joinDate);
    const membership = await GroupMembership.create({
      group: group._id,
      student: studentId,
      joinedAt,
      imported: true,
      importedAt,
    });
    created.memberships.push(membership._id);

    const effectivePrice = row.priceOverride != null ? row.priceOverride : g.monthlyPrice;
    if (effectivePrice < g.monthlyPrice) {
      const disc = await Discount.create({
        student: studentId,
        group: group._id,
        type: "fixed",
        value: g.monthlyPrice - effectivePrice,
        scope: "permanent",
        reason: "Import: individual narx",
        isActive: true,
        createdBy: currentUser?._id || null,
      });
      created.discounts.push(disc._id);
    }

    const studentMonths = months.filter(
      (m) => monthKey(m.year, m.month) >= monthKey(joinedAt.getUTCFullYear(), joinedAt.getUTCMonth() + 1),
    );
    const paidByKey = new Map(row.payments.map((c) => [monthKey(c.year, c.month), c]));
    let studentCollected = 0;
    let studentExpected = 0;

    for (const m of studentMonths) {
      const isStartMonth =
        m.year === startUtc.getUTCFullYear() && m.month === startUtc.getUTCMonth() + 1;
      const discounts =
        effectivePrice < g.monthlyPrice
          ? [{ type: "fixed", value: g.monthlyPrice - effectivePrice }]
          : [];
      const snap = computePaymentSnapshot({
        baseFee: g.monthlyPrice,
        year: m.year,
        month: m.month,
        joinedAt,
        leftAt: null,
        freezes: [],
        discounts,
        effectiveFrom: isStartMonth ? startUtc : null,
      });
      const cell = paidByKey.get(monthKey(m.year, m.month));
      const paidAmount = cell ? cell.amount : 0;
      const payment = await StudentPayment.create({
        student: studentId,
        group: group._id,
        membership: membership._id,
        year: m.year,
        month: m.month,
        baseFee: snap.baseFee,
        prorationFactor: snap.prorationFactor,
        discountApplied: snap.discountApplied,
        expectedAmount: snap.expectedAmount,
        paidAmount,
        status: deriveStatus(paidAmount, snap.expectedAmount),
        recalculatedAt: new Date(),
        imported: true,
        importedAt,
      });
      created.payments.push(payment._id);
      studentExpected += snap.expectedAmount;
      summary.paymentsCreated += 1;

      if (cell) {
        const paidAt = historicalPaidAt(m.year, m.month, joinedAt);
        const trx = await PaymentTransaction.create({
          payment: payment._id,
          student: studentId,
          group: group._id,
          year: m.year,
          month: m.month,
          amount: cell.amount,
          method: cell.method || "cash",
          paidAt,
          note: "Tarixiy import",
          imported: true,
          importedAt,
          importBatch: batch._id,
          createdBy: currentUser?._id || null,
        });
        created.transactions.push(trx._id);
        studentCollected += cell.amount;
        summary.transactionsCreated += 1;
        summary.totalCollected += cell.amount;
      }
    }

    perStudent.push({
      student: studentId,
      collected: studentCollected,
      expected: studentExpected,
      debt: Math.max(0, studentExpected - studentCollected),
    });
  }

  return { group, summary, perStudent };
};

// Klient sehrgar uchun yordamchi: guruh boshlanish sanasidan o'tgan oylar ro'yxati.
export const previewMonths = (startDate) =>
  elapsedMonths(startDate, localTodayMidnight());
