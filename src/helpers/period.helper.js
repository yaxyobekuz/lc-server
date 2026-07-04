import ApiError from "../utils/ApiError.js";

// Davr (period) invariantlari uchun umumiy yordamchi. Ikki granularlik:
//  - "month": [startYM..endYM] INCLUSIVE oy oralig'i (narx/maosh stavkasi).
//  - "date":  [start, end) HALF-OPEN sana oralig'i (a'zolik/biriktirish);
//             end (leftAt) kuni endi a'zo emas - davomat encoding bilan bir xil.
// Ochiq davr (end=null) → cheksizgacha davom etadi.

// Oy → tartib raqami (yil*12 + oy-1). Taqqoslash/oralik uchun.
export const monthToIndex = (year, month) => year * 12 + (month - 1);

export const indexToMonth = (idx) => ({
  year: Math.floor(idx / 12),
  month: (idx % 12) + 1,
});

// Davrni [start, end] raqamli oralig'iga aylantiradi. Ochiq → end=Infinity.
const toInterval = (p, granularity) => {
  if (granularity === "month") {
    const start = monthToIndex(p.startYear, p.startMonth);
    const end =
      p.endYear != null && p.endMonth != null
        ? monthToIndex(p.endYear, p.endMonth)
        : Infinity;
    return { start, end };
  }
  // date
  const start = new Date(p.startDate).getTime();
  const end = p.endDate ? new Date(p.endDate).getTime() : Infinity;
  return { start, end };
};

// Ikki oralik kesishadimi. month: inclusive (start<=end), date: half-open.
const intervalsOverlap = (a, b, granularity) => {
  if (granularity === "month") {
    return a.start <= b.end && b.start <= a.end;
  }
  return a.start < b.end && b.start < a.end;
};

// UTC timestampni "dd.mm.yyyy" ko'rinishida (sanalar UTC yarim tunda saqlanadi).
const formatDateUTC = (t) => {
  const d = new Date(t);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
};

// Davrning o'zini tekshiradi (start mavjud, end >= start).
export const assertValidPeriod = (period, granularity) => {
  const iv = toInterval(period, granularity);
  if (!Number.isFinite(iv.start)) {
    throw new ApiError(400, "Davr boshlanish sanasi majburiy");
  }
  if (iv.end !== Infinity && iv.end < iv.start) {
    throw new ApiError(400, "Davr tugashi boshlanishidan oldin bo'lishi mumkin emas");
  }
};

// Nomzod davr mavjud davrlar bilan to'qnashmasligini va scope ichida faqat bitta
// ochiq (end=null) davr bo'lishini ta'minlaydi. existing - SHU scope dagi boshqa
// davrlar (nomzodning o'zi excludeId orqali chiqarib tashlanishi kerak).
export const assertPeriodInvariants = (candidate, existing, granularity) => {
  assertValidPeriod(candidate, granularity);
  const cand = toInterval(candidate, granularity);
  let openCount = cand.end === Infinity ? 1 : 0;
  for (const e of existing) {
    const iv = toInterval(e, granularity);
    if (iv.end === Infinity) openCount += 1;
    if (intervalsOverlap(cand, iv, granularity)) {
      // "date" (a'zolik/biriktirish) uchun qaysi mavjud davr kesishayotganini
      // ko'rsatamiz - aks holda foydalanuvchi sababini bilmay chalkashadi.
      if (granularity === "date") {
        const end =
          iv.end === Infinity ? "hozircha ochiq" : formatDateUTC(iv.end);
        throw new ApiError(
          400,
          `Davrlar bir-biri bilan kesishmasligi kerak. Mavjud davr: ${formatDateUTC(iv.start)} – ${end}. Yangi sanani shu davr bilan kesishmaydigan qilib tanlang.`,
        );
      }
      throw new ApiError(400, "Davrlar bir-biri bilan kesishmasligi kerak");
    }
  }
  if (openCount > 1) {
    throw new ApiError(400, "Faqat bitta ochiq (tugamagan) davr bo'lishi mumkin");
  }
};

// Berilgan oy (year, month) qaysi davrga tushishini topadi (yoki null).
export const findPeriodForMonth = (periods, year, month) => {
  const ym = monthToIndex(year, month);
  for (const p of periods) {
    const iv = toInterval(p, "month");
    if (ym >= iv.start && ym <= iv.end) return p;
  }
  return null;
};

// Berilgan sana qaysi davrga tushishini topadi (half-open). null bo'lsa - hech qaysi.
export const findPeriodForDate = (periods, date) => {
  const t = new Date(date).getTime();
  for (const p of periods) {
    const iv = toInterval(p, "date");
    if (t >= iv.start && t < iv.end) return p;
  }
  return null;
};

// Davr (oy granularligi) berilgan [fromYM, toYM] so'rov oralig'i bilan kesishadigan
// oylar ro'yxatini qaytaradi - recompute oralig'ini aniqlash uchun.
export const monthsInRange = (startYear, startMonth, endYear, endMonth) => {
  const from = monthToIndex(startYear, startMonth);
  const to = monthToIndex(endYear, endMonth);
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(indexToMonth(i));
  return out;
};
