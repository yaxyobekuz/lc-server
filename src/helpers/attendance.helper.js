// Davomat helper - class day computation, dateKey, exemption overlay

const DAY_INDEX = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const dayOfWeekOf = (date) => {
  const d = new Date(date);
  return DAY_INDEX[d.getUTCDay()];
};

// "YYYY-MM-DD" UTC kalendar bo'yicha
export const dateKeyOf = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Sanani UTC midnight ga keltirish
export const toUtcMidnight = (date) => {
  const d = new Date(date);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Mahalliy vaqt zonasi (Asia/Tashkent = UTC+5, DST yo'q) ───
// Server qaysi vaqt zonasida ishlashidan qat'i nazar "bugun" mahalliy kalendar
// kuni bo'yicha hisoblanadi. Aks holda yarim tundan keyin (00:00–05:00 mahalliy)
// "bugun" UTC bo'yicha kechagi kun bo'lib qolib, davomat belgilash rad etiladi.
export const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN || 300);

const shiftToLocal = (instant) =>
  new Date(new Date(instant).getTime() + TZ_OFFSET_MIN * 60 * 1000);

// Mahalliy kalendar kuni (UTC-midnight ko'rinishida - saqlangan dateKey bilan mos)
export const localTodayMidnight = (now = new Date()) => {
  const s = shiftToLocal(now);
  return new Date(
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0),
  );
};

export const localTodayKey = (now = new Date()) => dateKeyOf(shiftToLocal(now));

export const localDayOfWeek = (now = new Date()) => dayOfWeekOf(shiftToLocal(now));

// Kiruvchi sanani timezone-xavfsiz ravishda mahalliy kalendar kuniga (UTC-midnight
// ko'rinishida) keltiradi. Saqlanadigan `date`/`dateKey` shu funksiya orqali olinadi
// va "bugun" (localTodayMidnight) bilan bir xil ta'rifga ega bo'ladi.
//   • "YYYY-MM-DD" string  → aynan shu kalendar kuni (timezone'siz, eng ishonchli)
//   • Date/ISO instant      → mahalliy (Asia/Tashkent) zonadagi kalendar kuni
// Noto'g'ri qiymat uchun null qaytaradi (chaqiruvchi tomon 400 bilan rad etadi).
export const parseLocalDay = (input) => {
  if (typeof input === "string" && DATE_KEY_RE.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    // Date overflow qo'riqlovi (mas. 2026-02-31 → mart) - noto'g'ri sana rad etiladi
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }
  const instant = new Date(input);
  if (Number.isNaN(instant.getTime())) return null;
  return localTodayMidnight(instant);
};

// parseLocalDay natijasidan dateKey (har doim mos keladi)
export const parseLocalDayKey = (input) => {
  const d = parseLocalDay(input);
  return d ? dateKeyOf(d) : null;
};

// Diapazonda har bir kunni iteratsiya qiladi (UTC)
const iterateDays = function* (fromDate, toDate) {
  const start = toUtcMidnight(fromDate);
  const end = toUtcMidnight(toDate);
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    yield new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
};

// ─── Jadval versiyalash ───
// Har bir slotda effectiveFrom (Date|null) bor. Berilgan sanada AMAL QILGAN
// versiyani qaytaradi: har bir KUN uchun, effectiveFrom <= sana bo'lgan slotlar
// orasidan eng KEYINGI effectiveFrom ga ega bo'lganlarini tanlaymiz (null =
// "boshidan" = eng eski). Shunday qilib jadval keyin o'zgartirilsa, eski
// sanalarda eski versiya, yangi sanalarda yangi versiya ishlatiladi.
//   • onDate berilmasa - bugungi (mahalliy) sana bo'yicha "joriy" versiya.
export const scheduleActiveOn = (schedule, onDate = null) => {
  const items = schedule || [];
  if (items.length === 0) return [];
  const target = onDate ? toUtcMidnight(onDate).getTime() : localTodayMidnight().getTime();

  // effectiveFrom timestampi (null → -Infinity = boshidan)
  const effTs = (it) =>
    it.effectiveFrom ? toUtcMidnight(it.effectiveFrom).getTime() : -Infinity;

  // Har kun uchun amal qilgan (<= target) eng so'nggi effectiveFrom ni topamiz
  const latestEffByDay = new Map();
  for (const it of items) {
    const ts = effTs(it);
    if (ts > target) continue; // bu versiya hali amal qilmaydi
    const cur = latestEffByDay.get(it.day);
    if (cur === undefined || ts > cur) latestEffByDay.set(it.day, ts);
  }

  // Faqat o'sha kunning eng so'nggi amal qilayotgan versiyasidagi slotlar
  return items.filter((it) => {
    const ts = effTs(it);
    if (ts > target) return false;
    return latestEffByDay.get(it.day) === ts;
  });
};

// Guruh schedule asosida diapazondagi class SESSIYALARI (har biri alohida).
// Kunda bir nechta dars (slot) bo'lsa - har sessiya alohida qaytadi.
//   • bir slotli kun  → slot = "" (eski xatti-harakat, bitta yozuv/kun)
//   • ko'p slotli kun → har slot uchun slot = startTime (mas. "14:00")
// group.startDate bo'lsa - undan oldingi kunlar hisoblanmaydi.
// holidaySet berilsa - bayram kunlari hisoblanmaydi.
export const getClassDaysInRange = (group, fromDate, toDate, holidaySet = null) => {
  // Versiyalash: har bir kun (dow) uchun slotlarni effectiveFrom bo'yicha
  // guruhlaymiz, shunda har sanada o'sha sanada AMAL QILGAN versiyani tanlaymiz.
  // dayMap: dow -> [{ effTs, slots: [{startTime,endTime}] }] (effTs bo'yicha o'suvchi)
  const byDayEff = new Map(); // dow -> Map(effTs -> slots[])
  for (const item of group?.schedule || []) {
    const effTs = item.effectiveFrom
      ? toUtcMidnight(item.effectiveFrom).getTime()
      : -Infinity;
    if (!byDayEff.has(item.day)) byDayEff.set(item.day, new Map());
    const versions = byDayEff.get(item.day);
    if (!versions.has(effTs)) versions.set(effTs, []);
    versions.get(effTs).push({ startTime: item.startTime, endTime: item.endTime });
  }
  // Har versiya slotlarini vaqt bo'yicha tartiblaymiz + versiyalarni effTs o'suvchi
  const dayMap = new Map(); // dow -> [{ effTs, slots }]
  for (const [dow, versions] of byDayEff) {
    const arr = [];
    for (const [effTs, slots] of versions) {
      slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
      arr.push({ effTs, slots });
    }
    arr.sort((a, b) => a.effTs - b.effTs);
    dayMap.set(dow, arr);
  }

  // Berilgan sana (ts) uchun o'sha kunda amal qilgan versiyaning slotlari
  const slotsActiveOn = (dow, ts) => {
    const versions = dayMap.get(dow);
    if (!versions) return null;
    let active = null;
    for (const v of versions) {
      if (v.effTs <= ts) active = v.slots;
      else break; // o'suvchi tartib - keyingilari kelajakda
    }
    return active;
  };

  const startTs = group?.startDate ? toUtcMidnight(group.startDate).getTime() : null;
  const result = [];
  for (const d of iterateDays(fromDate, toDate)) {
    if (startTs !== null && d.getTime() < startTs) continue;
    const dow = dayOfWeekOf(d);
    const slots = slotsActiveOn(dow, d.getTime());
    if (!slots || slots.length === 0) continue;
    const dKey = dateKeyOf(d);
    if (holidaySet && holidaySet.has(dKey)) continue;
    const multi = slots.length > 1;
    slots.forEach((s, idx) => {
      result.push({
        date: d,
        dateKey: dKey,
        dayOfWeek: dow,
        slot: multi ? s.startTime : "",
        startTime: s.startTime,
        endTime: s.endTime,
        isFirstSlot: idx === 0,
      });
    });
  }
  return result;
};

// Active exemption shu sana va kun-haftani qoplaydimi
export const isExemptOn = (exemptions, date, dayOfWeek) => {
  const target = toUtcMidnight(date).getTime();
  return (exemptions || []).some((ex) => {
    if (!ex.isActive) return false;
    const start = toUtcMidnight(ex.startDate).getTime();
    if (target < start) return false;
    if (ex.endDate) {
      const end = toUtcMidnight(ex.endDate).getTime();
      if (target > end) return false;
    }
    if (Array.isArray(ex.daysOfWeek) && ex.daysOfWeek.length > 0) {
      if (!ex.daysOfWeek.includes(dayOfWeek)) return false;
    }
    return true;
  });
};

export const defaultStatusFor = (exemptions, date, dayOfWeek) =>
  isExemptOn(exemptions, date, dayOfWeek) ? "exempt" : null;

// Sana kurs oralig'ida (startDate..endDate, ikkalasi inclusive) ekanligini tekshiradi
export const withinCourseBounds = (group, date) => {
  const t = toUtcMidnight(date).getTime();
  if (group?.startDate && t < toUtcMidnight(group.startDate).getTime()) return false;
  if (group?.endDate && t > toUtcMidnight(group.endDate).getTime()) return false;
  return true;
};

// Berilgan sana bayram kunimi (dateKey holidaySet ichida bormi)
export const isHolidayOn = (holidaySet, date) =>
  !!holidaySet && holidaySet.has(dateKeyOf(date));
