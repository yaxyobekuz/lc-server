import { toUtcMidnight } from "../../../helpers/attendance.helper.js";

// (year, month) → mutlaq oy indeksi (taqqoslash/oraliq uchun). month: 1..12.
export const monthKey = (year, month) => year * 12 + (month - 1);

// startDate dan now gacha (ikkalasini ham kiritib) o'tgan oylar ro'yxati
// [{year, month}]. Matritsa ustunlari aynan shu oylar. now default - bugun.
export const elapsedMonths = (startDate, now) => {
  const start = toUtcMidnight(startDate);
  const end = toUtcMidnight(now);
  const startIndex = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const endIndex = end.getUTCFullYear() * 12 + end.getUTCMonth();
  const months = [];
  for (let i = startIndex; i <= endIndex; i += 1) {
    months.push({ year: Math.floor(i / 12), month: (i % 12) + 1 });
  }
  return months;
};

// Tarixiy to'lov tranzaksiyasi sanasi: agar to'lov oyi o'quvchi qo'shilgan oy
// bo'lsa - aniq joinedAt kuni; aks holda oyning 1-kuni. Shunda kirim shu oyga
// tegishli bo'lib hisoblanadi (mavjud finance kunlik kirim grafigi izchil).
export const historicalPaidAt = (year, month, joinedAt) => {
  const join = toUtcMidnight(joinedAt);
  if (join.getUTCFullYear() === year && join.getUTCMonth() + 1 === month) {
    return join;
  }
  return new Date(Date.UTC(year, month - 1, 1));
};
