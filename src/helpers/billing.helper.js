import { getActiveForStudent } from "../modules/discounts/services/discounts.service.js";
import { getClassDaysInRange } from "./attendance.helper.js";

const daysInMonth = (year, month) => new Date(year, month, 0).getUTCDate();

// Guruhning o'sha oydagi dars kunlari soni (schedule asosida)
export const lessonsInMonth = (group, year, month) => {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return getClassDaysInRange(group, start, end).length;
};

// O'qigan qismi uchun prorate baza summasi: monthlyPrice × (oyBoshi..effectiveEnd darslari) / (butun oy darslari).
// effectiveEnd berilmasa yoki oy oxiridan keyin bo'lsa — to'liq oy narxi.
export const proratedBase = (group, { year, month }, effectiveEnd) => {
  const base = Number(group?.monthlyPrice) || 0;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const total = getClassDaysInRange(group, monthStart, monthEnd).length;
  if (total <= 0) return base; // jadval yo'q — prorate qilib bo'lmaydi
  const end = effectiveEnd && effectiveEnd < monthEnd ? effectiveEnd : monthEnd;
  const used = getClassDaysInRange(group, monthStart, end).length;
  return Math.round((base * used) / total);
};

// O'qituvchi kelmagan kun jarimasi sozlamasi: o'qituvchi override → guruh override → global default.
export const resolveAbsenceConfig = (group, settings, teacher = null) => {
  const tMode = teacher?.teacherAbsenceMode;
  if (tMode && tMode !== "inherit") {
    return { mode: tMode, amount: Number(teacher?.teacherAbsenceAmount) || 0 };
  }
  const gMode = group?.teacherAbsenceMode;
  if (gMode && gMode !== "inherit") {
    return { mode: gMode, amount: Number(group?.teacherAbsenceAmount) || 0 };
  }
  return {
    mode: settings?.teacherAbsenceMode || "none",
    amount: Number(settings?.teacherAbsenceAmount) || 0,
  };
};

// O'qituvchi kelmagan 1 kun uchun o'quvchidan ayiriladigan summa.
// auto → oylik narx / oydagi darslar soni; fixed → belgilangan summa; none → 0.
export const computePerLessonAmount = (group, { year, month }, settings, teacher = null) => {
  const { mode, amount } = resolveAbsenceConfig(group, settings, teacher);
  if (mode === "none") return 0;
  if (mode === "fixed") return Math.max(0, Math.round(amount));
  const lessons = lessonsInMonth(group, year, month);
  if (lessons <= 0) return 0;
  return Math.max(0, Math.round((Number(group.monthlyPrice) || 0) / lessons));
};

export const computeDueDate = ({ year, month }, dayOfMonth) => {
  const day = Math.min(Math.max(1, Number(dayOfMonth) || 1), daysInMonth(year, month));
  // UTC midnight on the due date
  return new Date(Date.UTC(year, month - 1, day));
};

// Active discountlarni jamlab summani hisoblaydi (percent additiv, max 100%; keyin amount).
// groupId berilsa — global + shu guruhga xos chegirmalar qo'llanadi.
// Returns: { amount, snapshot: [{ kind, value, valueType }] }
export const computeDiscountAmount = async (
  studentId,
  baseAmount,
  asOf = new Date(),
  groupId,
) => {
  const discounts = await getActiveForStudent(studentId, asOf, groupId);
  if (!discounts || discounts.length === 0) {
    return { amount: 0, snapshot: [] };
  }

  let percentTotal = 0;
  let amountTotal = 0;
  const snapshot = [];

  for (const d of discounts) {
    snapshot.push({ kind: d.kind?._id || d.kind, value: d.value, valueType: d.valueType });
    if (d.valueType === "percent") {
      percentTotal += Number(d.value) || 0;
    } else if (d.valueType === "amount") {
      amountTotal += Number(d.value) || 0;
    }
  }

  percentTotal = Math.min(100, Math.max(0, percentTotal));
  const percentPart = (baseAmount * percentTotal) / 100;
  let total = percentPart + amountTotal;
  total = Math.min(baseAmount, Math.max(0, total));

  return { amount: Math.round(total), snapshot };
};
