import { toUtcMidnight, isFrozenOn } from "../../../helpers/attendance.helper.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Oydagi kalendar kunlar soni
export const daysInMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

// effectiveFrom (guruh fee'si qaysi sanadan kuchga kirgani) dan oy kunini chiqaradi.
// Fee oyidan oldin bo'lsa → 1 (butun oy). Keyin bo'lsa → null (kuchga kirmagan).
// Bir xil oy bo'lsa → o'sha sananing UTC kuni.
const effectiveDayFor = (effectiveFrom, year, month) => {
  if (!effectiveFrom) return 1;
  const eff = toUtcMidnight(effectiveFrom);
  const effIndex = eff.getUTCFullYear() * 12 + eff.getUTCMonth();
  const feeIndex = year * 12 + (month - 1);
  if (effIndex < feeIndex) return 1; // oydan oldin → butun oy
  if (effIndex > feeIndex) return null; // oydan keyin → hali kuchga kirmagan
  return eff.getUTCDate();
};

// Proratsiya (kalendar kun + muzlatish ayrimasi):
// (startDay..endDay) ichidagi muzlatilmagan kunlar / oydagi jami kunlar.
// startDay = max(qo'shilgan_kun, kuchga_kirgan_kun); endDay = ketgan_kun yoki oy oxiri.
// joinedAt/effectiveFrom oy boshidan oldin → 1. leftAt yo'q → oy oxirigacha (inclusive).
export const computeProration = ({
  year,
  month,
  joinedAt,
  leftAt = null,
  freezes = [],
  effectiveFrom = null,
}) => {
  const totalDays = daysInMonth(year, month);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const join = joinedAt ? toUtcMidnight(joinedAt) : monthStart;
  const left = leftAt ? toUtcMidnight(leftAt) : null;

  // Bu oyga umuman tegishli emas: keyin boshlagan yoki avval tugatgan.
  if (join.getTime() > monthEnd.getTime()) {
    return { factor: 0, payableDays: 0, totalDays };
  }
  if (left && left.getTime() < monthStart.getTime()) {
    return { factor: 0, payableDays: 0, totalDays };
  }

  const effectiveDay = effectiveDayFor(effectiveFrom, year, month);
  if (effectiveDay === null) {
    // Fee shu oydan keyin kuchga kiradi - hali to'lov yo'q
    return { factor: 0, payableDays: 0, totalDays };
  }

  const joinStartDay =
    join.getTime() <= monthStart.getTime() ? 1 : join.getUTCDate();
  const startDay = Math.max(joinStartDay, effectiveDay);
  const endDay =
    !left || left.getTime() >= monthEnd.getTime() ? totalDays : left.getUTCDate();

  let payable = 0;
  for (let d = startDay; d <= endDay; d += 1) {
    const day = new Date(Date.UTC(year, month - 1, d));
    if (!isFrozenOn(freezes, day)) payable += 1;
  }

  return {
    factor: clamp(payable / totalDays, 0, 1),
    payableDays: payable,
    totalDays,
  };
};

// Chegirmalarni proratsiyalangan fee ga nisbatan yechadi (percent + fixed, capped).
export const resolveDiscountAmount = (discounts, proratedFee) => {
  let pct = 0;
  let fixed = 0;
  for (const d of discounts || []) {
    if (d.type === "percent") pct += Number(d.value) || 0;
    else fixed += Number(d.value) || 0;
  }
  pct = clamp(pct, 0, 100);
  const percentCut = Math.round((proratedFee * pct) / 100);
  return clamp(percentCut + fixed, 0, proratedFee);
};

// To'liq snapshot hisobi - baseFee, proratsiya va chegirmalardan.
export const computePaymentSnapshot = ({
  baseFee = 0,
  year,
  month,
  joinedAt,
  freezes = [],
  discounts = [],
  effectiveFrom = null,
}) => {
  const { factor } = computeProration({
    year,
    month,
    joinedAt,
    freezes,
    effectiveFrom,
  });
  const proratedFee = Math.round((Number(baseFee) || 0) * factor);
  const discountApplied = resolveDiscountAmount(discounts, proratedFee);
  const expectedAmount = Math.max(0, proratedFee - discountApplied);
  return {
    baseFee: Number(baseFee) || 0,
    prorationFactor: factor,
    discountApplied,
    expectedAmount,
  };
};

// paidAmount va expectedAmount dan status aniqlaydi.
export const deriveStatus = (paidAmount, expectedAmount) => {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount < expectedAmount) return "partial";
  return "paid";
};
