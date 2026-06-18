import {
  computeProration,
  deriveStatus,
  daysInMonth,
} from "../../finance/services/proration.helper.js";

export { computeProration, deriveStatus, daysInMonth };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const DAY = 24 * 60 * 60 * 1000;

// To'liq maosh snapshot hisobi - bir oydagi BARCHA maosh davrlari yig'indisi.
// Har bir davr [startDate, endDate) (endDate EXCLUSIVE) o'z stavkasi bilan oy
// ichidagi kunlariga proratsiya qilinadi va summalar QO'SHILADI. Davrlar
// kesishmaydi (invariant) - kun ikki marta sanalmaydi. "Maosh turi" (display)
// oydagi eng oxirgi davr turini oladi - "aktiv davr turi".
export const computePeriodsSnapshot = ({
  periods = [],
  groupRevenue = 0,
  year,
  month,
}) => {
  const totalDays = daysInMonth(year, month);
  const sorted = [...periods].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  let proratedFixed = 0;
  let percentAmount = 0;
  let payableDays = 0;
  let minStart = null;
  let maxEndExcl = null;
  let hasOpen = false;
  // Aktiv (oxirgi) davr stavkasi - faqat ko'rsatish uchun.
  let activeType = "fixed";
  let activeFixed = 0;
  let activePercent = 0;

  for (const p of sorted) {
    const { factor, payableDays: pd } = computeProration({
      year,
      month,
      joinedAt: p.startDate || null,
      leftAt: p.endDate || null,
      leftExclusive: true,
      freezes: [],
    });

    const useFixed = p.salaryType === "fixed" || p.salaryType === "mixed";
    const usePercent = p.salaryType === "percent" || p.salaryType === "mixed";
    if (useFixed) proratedFixed += Math.round((Number(p.fixedAmount) || 0) * factor);
    if (usePercent) {
      percentAmount += Math.round(
        ((Number(groupRevenue) || 0) * (Number(p.percentRate) || 0) * factor) / 100,
      );
    }
    payableDays += pd;

    activeType = p.salaryType || "fixed";
    activeFixed = Number(p.fixedAmount) || 0;
    activePercent = Number(p.percentRate) || 0;

    const s = new Date(p.startDate);
    if (!minStart || s.getTime() < minStart.getTime()) minStart = s;
    if (!p.endDate) hasOpen = true;
    else {
      const e = new Date(p.endDate);
      if (!maxEndExcl || e.getTime() > maxEndExcl.getTime()) maxEndExcl = e;
    }
  }

  const baseEarnings = proratedFixed + percentAmount;
  const expectedAmount = Math.max(0, baseEarnings);

  return {
    prorationFactor: clamp(payableDays / totalDays, 0, 1),
    payableDays,
    totalDays,
    proratedFixed,
    percentAmount,
    baseEarnings,
    expectedAmount,
    // Stavka (display) + ish oynasi (breakdown "Ish davri").
    salaryType: activeType,
    fixedAmount: activeFixed,
    percentRate: activePercent,
    workStartDate: minStart,
    workEndDate: hasOpen || !maxEndExcl ? null : new Date(maxEndExcl.getTime() - DAY),
  };
};
