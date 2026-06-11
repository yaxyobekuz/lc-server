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
// joinedAt/effectiveFrom oy boshidan oldin → 1. leftAt yo'q → oy oxirigacha.
// leftExclusive=false (maosh: workEndDate kuni ham ishlangan kun) → leftAt inclusive;
// leftExclusive=true (a'zolik: leftAt kuni endi a'zo emas - removeStudent/transfer
// va davomat bilan bir xil encoding) → oxirgi to'lanadigan kun = leftAt - 1.
export const computeProration = ({
  year,
  month,
  joinedAt,
  leftAt = null,
  leftExclusive = false,
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
  if (left) {
    const leftBeforeMonth = leftExclusive
      ? left.getTime() <= monthStart.getTime()
      : left.getTime() < monthStart.getTime();
    if (leftBeforeMonth) {
      return { factor: 0, payableDays: 0, totalDays };
    }
  }

  const effectiveDay = effectiveDayFor(effectiveFrom, year, month);
  if (effectiveDay === null) {
    // Fee shu oydan keyin kuchga kiradi - hali to'lov yo'q
    return { factor: 0, payableDays: 0, totalDays };
  }

  const joinStartDay =
    join.getTime() <= monthStart.getTime() ? 1 : join.getUTCDate();
  const startDay = Math.max(joinStartDay, effectiveDay);
  let endDay;
  if (!left || left.getTime() > monthEnd.getTime()) {
    endDay = totalDays;
  } else if (leftExclusive) {
    endDay = left.getUTCDate() - 1;
  } else {
    endDay = left.getTime() >= monthEnd.getTime() ? totalDays : left.getUTCDate();
  }

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

// Bir nechta a'zolik davri (periods) bo'yicha to'lanadigan kunlar yig'indisi.
// Bir o'quvchi bitta oyda guruhdan ketib qayta qo'shilsa (rejoin) - har bir
// davr alohida proratsiya qilinib, kunlar QO'SHILADI (bir kun ikki marta
// sanalmaydi: davrlar a'zolik bo'yicha kesishmaydi). periods bo'sh bo'lsa
// bitta {joinedAt, leftAt} davr sifatida qaraladi.
const sumPayableDays = ({ year, month, periods, freezes, effectiveFrom }) => {
  let payableDays = 0;
  let totalDays = 0;
  for (const p of periods) {
    const r = computeProration({
      year,
      month,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt || null,
      leftExclusive: true,
      freezes,
      effectiveFrom,
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
// previousBaseFee berilsa (oy o'rtasida tarif o'zgargan): effectiveFrom'dan
// OLDINGI a'zolik kunlari eski tarifda hisoblanadi - aks holda oyning birinchi
// yarmi hisobsiz qolib, summa ikkala tarifdan ham past chiqardi.
export const computePaymentSnapshot = ({
  baseFee = 0,
  previousBaseFee = null,
  year,
  month,
  joinedAt,
  leftAt = null,
  periods = null,
  freezes = [],
  discounts = [],
  effectiveFrom = null,
}) => {
  const effPeriods =
    periods && periods.length ? periods : [{ joinedAt, leftAt }];

  const main = sumPayableDays({ year, month, periods: effPeriods, freezes, effectiveFrom });
  const totalDays = main.totalDays || daysInMonth(year, month);

  let proratedFee = Math.round(
    ((Number(baseFee) || 0) * main.payableDays) / totalDays,
  );
  let factor = clamp(main.payableDays / totalDays, 0, 1);

  if (previousBaseFee != null && effectiveFrom) {
    // effectiveFrom cheklovisiz to'liq a'zolik kunlari - farqi eski tarif kunlari
    const full = sumPayableDays({
      year,
      month,
      periods: effPeriods,
      freezes,
      effectiveFrom: null,
    });
    const beforeDays = Math.max(0, full.payableDays - main.payableDays);
    if (beforeDays > 0 && totalDays > 0) {
      proratedFee += Math.round(((Number(previousBaseFee) || 0) * beforeDays) / totalDays);
    }
    // Kliyent breakdown'i (baseFee × factor) aralash summa bilan mos kelishi uchun
    factor = Number(baseFee) > 0 ? proratedFee / Number(baseFee) : factor;
  }

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
