import { getActiveForStudent } from "../modules/discounts/services/discounts.service.js";

const daysInMonth = (year, month) => new Date(year, month, 0).getUTCDate();

export const computeDueDate = ({ year, month }, dayOfMonth) => {
  const day = Math.min(Math.max(1, Number(dayOfMonth) || 1), daysInMonth(year, month));
  // UTC midnight on the due date
  return new Date(Date.UTC(year, month - 1, day));
};

// Active discountlarni jamlab summani hisoblaydi (percent additiv, max 100%; keyin amount).
// Returns: { amount, snapshot: [{ kind, value, valueType }] }
export const computeDiscountAmount = async (studentId, baseAmount, asOf = new Date()) => {
  const discounts = await getActiveForStudent(studentId, asOf);
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
