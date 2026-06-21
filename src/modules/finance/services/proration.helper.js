import { toUtcMidnight } from "../../../helpers/attendance.helper.js";

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Oydagi kalendar kunlar soni
export const daysInMonth = (year, month) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

// Proratsiya (kalendar kun + muzlatish ayrimasi):
// (startDay..endDay) ichidagi muzlatilmagan kunlar / oydagi jami kunlar.
// startDay = qo'shilgan kun; endDay = ketgan kun yoki oy oxiri.
// joinedAt oy boshidan oldin → 1. leftAt yo'q → oy oxirigacha.
// leftExclusive=false (maosh: workEndDate kuni ham ishlangan kun) → leftAt inclusive;
// leftExclusive=true (a'zolik: leftAt kuni endi a'zo emas - removeStudent/transfer
// va davomat bilan bir xil encoding) → oxirgi to'lanadigan kun = leftAt - 1.
// NARX butun oyga doimiy (oy+yil darajasi) - mid-month tarif/effectiveFrom yo'q.
export const computeProration = ({
  year,
  month,
  joinedAt,
  leftAt = null,
  leftExclusive = false,
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
  if (left) {
    const leftBeforeMonth = leftExclusive
      ? left.getTime() <= monthStart.getTime()
      : left.getTime() < monthStart.getTime();
    if (leftBeforeMonth) {
      return { factor: 0, payableDays: 0, totalDays };
    }
  }

  const startDay = join.getTime() <= monthStart.getTime() ? 1 : join.getUTCDate();
  let endDay;
  if (!left || left.getTime() > monthEnd.getTime()) {
    endDay = totalDays;
  } else if (leftExclusive) {
    endDay = left.getUTCDate() - 1;
  } else {
    endDay = left.getTime() >= monthEnd.getTime() ? totalDays : left.getUTCDate();
  }

  const payable = Math.max(0, endDay - startDay + 1);

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

// Bir nechta a'zolik davri (periods) bo'yicha to'lanadigan kunlar yig'indisi.
// Bir o'quvchi bitta oyda guruhdan ketib qayta qo'shilsa (rejoin) - har bir
// davr alohida proratsiya qilinib, kunlar QO'SHILADI (bir kun ikki marta
// sanalmaydi: davrlar a'zolik bo'yicha kesishmaydi). periods bo'sh bo'lsa
// bitta {joinedAt, leftAt} davr sifatida qaraladi.
const sumPayableDays = ({ year, month, periods }) => {
  let payableDays = 0;
  let totalDays = 0;
  for (const p of periods) {
    const r = computeProration({
      year,
      month,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt || null,
      leftExclusive: true,
    });
    totalDays = r.totalDays;
    payableDays += r.payableDays;
  }
  return { payableDays, totalDays };
};

// To'liq snapshot hisobi - baseFee, proratsiya va chegirmalardan.
// periods: o'quvchining shu oydagi a'zolik davrlari [{joinedAt, leftAt(EXCLUSIVE)}].
// Bir nechta davr (rejoin) bo'lsa kunlar qo'shiladi. Orqaga-moslik uchun
// joinedAt/leftAt to'g'ridan-to'g'ri ham qabul qilinadi (bitta davr).
// MUHIM: periods === null → bitta {joinedAt, leftAt} davr (eski yo'l).
// periods === [] (bo'sh massiv) → o'quvchi shu oyda guruhda BO'LMAGAN → 0 kun
// (to'liq oyga default qilmaymiz - ketgan o'quvchiga qarz tiklanmasin).
export const computePaymentSnapshot = ({
  baseFee = 0,
  year,
  month,
  joinedAt,
  leftAt = null,
  periods = null,
  discounts = [],
}) => {
  const effPeriods = periods === null ? [{ joinedAt, leftAt }] : periods;

  const main = sumPayableDays({ year, month, periods: effPeriods });
  const totalDays = main.totalDays || daysInMonth(year, month);

  const proratedFee = Math.round(
    ((Number(baseFee) || 0) * main.payableDays) / totalDays,
  );
  const factor = clamp(main.payableDays / totalDays, 0, 1);

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
