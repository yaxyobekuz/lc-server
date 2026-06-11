import {
  computeProration,
  deriveStatus,
  daysInMonth,
} from "../../finance/services/proration.helper.js";

export { computeProration, deriveStatus, daysInMonth };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Bonus/jarima yig'indilarini baseEarnings ga nisbatan hisoblaydi.
export const resolveAdjustments = (adjustments, baseEarnings) => {
  let bonusTotal = 0;
  let fineTotal = 0;
  for (const a of adjustments || []) {
    const amt =
      a.valueType === "percent"
        ? Math.round((baseEarnings * clamp(Number(a.value) || 0, 0, 100)) / 100)
        : Number(a.value) || 0;
    if (a.kind === "bonus") bonusTotal += amt;
    else fineTotal += amt;
  }
  return { bonusTotal, fineTotal };
};

// To'liq maosh snapshot hisobi.
// Fiksa va foiz qismlari ishlangan kunlar ulushiga (factor) proratsiya qilinadi -
// o'qituvchi oy o'rtasida boshlasa (workStartDate) yoki tugatsa (workEndDate).
export const computeSalarySnapshot = ({
  salaryType = "fixed",
  fixedAmount = 0,
  percentRate = 0,
  groupRevenue = 0,
  year,
  month,
  workStartDate,
  workEndDate,
  adjustments = [],
}) => {
  const { factor, payableDays, totalDays } = computeProration({
    year,
    month,
    joinedAt: workStartDate || null,
    leftAt: workEndDate || null,
    freezes: [],
  });

  const useFixed = salaryType === "fixed" || salaryType === "mixed";
  const usePercent = salaryType === "percent" || salaryType === "mixed";

  const proratedFixed = useFixed
    ? Math.round((Number(fixedAmount) || 0) * factor)
    : 0;
  const percentAmount = usePercent
    ? Math.round(
        ((Number(groupRevenue) || 0) * (Number(percentRate) || 0) * factor) / 100,
      )
    : 0;
  const baseEarnings = proratedFixed + percentAmount;

  const { bonusTotal, fineTotal } = resolveAdjustments(adjustments, baseEarnings);
  const expectedAmount = Math.max(0, baseEarnings + bonusTotal - fineTotal);

  return {
    prorationFactor: factor,
    payableDays,
    totalDays,
    proratedFixed,
    percentAmount,
    baseEarnings,
    bonusTotal,
    fineTotal,
    expectedAmount,
  };
};
