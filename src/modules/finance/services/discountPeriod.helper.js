import { DISCOUNT_SCOPES } from "../../../constants/discountScopes.js";

export const PERIOD_KEYS = ["scope", "year", "month", "endYear", "endMonth"];

const monthIndex = (year, month) => year * 12 + (month - 1);

// Eski hujjatlarda endYear/endMonth maydoni yo'q - null deb olinadi.
export const periodOf = (doc) =>
  Object.fromEntries(PERIOD_KEYS.map((k) => [k, doc?.[k] ?? null]));

export const samePeriod = (a, b) => {
  const pa = periodOf(a);
  const pb = periodOf(b);
  return PERIOD_KEYS.every((k) => pa[k] === pb[k]);
};

// Bitta oylik oraliq aslida monthly - dublikat tekshiruvi to'g'ri ishlashi uchun.
export const normalizePeriod = (input) => {
  const p = periodOf(input);
  if (p.scope === "permanent") {
    return { ...p, year: null, month: null, endYear: null, endMonth: null };
  }
  if (p.scope !== "range") return { ...p, endYear: null, endMonth: null };
  if (p.year && p.year === p.endYear && p.month === p.endMonth) {
    return { ...p, scope: "monthly", endYear: null, endMonth: null };
  }
  return p;
};

export const periodError = ({ scope, year, month, endYear, endMonth }) => {
  if (!DISCOUNT_SCOPES.includes(scope)) return "Amal qilish davri noto'g'ri";
  if (scope === "permanent") return null;
  if (!year || !month) return "Chegirma oyini tanlang";
  if (scope !== "range") return null;
  if (!endYear || !endMonth) return "Chegirma tugaydigan oyni tanlang";
  if (monthIndex(endYear, endMonth) < monthIndex(year, month)) {
    return "Tugash oyi boshlanish oyidan oldin bo'lmasligi kerak";
  }
  return null;
};

const pairLte = (yKey, mKey, year, month) => ({
  $or: [{ [yKey]: { $lt: year } }, { [yKey]: year, [mKey]: { $lte: month } }],
});

const pairGte = (yKey, mKey, year, month) => ({
  $or: [{ [yKey]: { $gt: year } }, { [yKey]: year, [mKey]: { $gte: month } }],
});

// Discount so'rovi: (year, month) oyida amal qiladigan chegirmalar.
export const discountsInMonthFilter = (year, month) => ({
  $or: [
    { scope: "permanent" },
    { scope: "monthly", year, month },
    { scope: "from", ...pairLte("year", "month", year, month) },
    {
      scope: "range",
      $and: [
        pairLte("year", "month", year, month),
        pairGte("endYear", "endMonth", year, month),
      ],
    },
  ],
});

// StudentPayment so'rovi: davrga tushadigan oylar; {} → barcha oylar.
export const monthsInPeriodFilter = (period = {}) => {
  const { scope, year, month, endYear, endMonth } = periodOf(period);
  if (!year || !month) return {};
  if (scope === "monthly") return { year, month };
  if (scope === "from") return pairGte("year", "month", year, month);
  if (scope === "range" && endYear && endMonth) {
    return {
      $and: [
        pairGte("year", "month", year, month),
        pairLte("year", "month", endYear, endMonth),
      ],
    };
  }
  return {};
};
