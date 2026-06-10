import { toUtcMidnight, isFrozenOn } from "../../../helpers/attendance.helper.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Oydagi kalendar kunlar soni
export const daysInMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

// Proratsiya (kalendar kun + muzlatish ayrimasi):
// (qo'shilgan_kun..oy_oxiri) ichidagi muzlatilmagan kunlar / oydagi jami kunlar.
// joinedAt oy boshidan oldin → butun oy (factor=1). Keyingi oyda → 0.
export const computeProration = ({ year, month, joinedAt, freezes = [] }) => {
  const totalDays = daysInMonth(year, month);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const join = joinedAt ? toUtcMidnight(joinedAt) : monthStart;

  if (join.getTime() > monthEnd.getTime()) {
    return { factor: 0, payableDays: 0, totalDays };
  }

  const startDay =
    join.getTime() <= monthStart.getTime() ? 1 : join.getUTCDate();

  let payable = 0;
  for (let d = startDay; d <= totalDays; d += 1) {
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
}) => {
  const { factor } = computeProration({ year, month, joinedAt, freezes });
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
