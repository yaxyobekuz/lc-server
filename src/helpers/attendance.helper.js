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

// Guruh schedule asosida diapazondagi class SESSIYALARI (har biri alohida).
// Kunda bir nechta dars (slot) bo'lsa - har sessiya alohida qaytadi.
//   • bir slotli kun  → slot = "" (eski xatti-harakat, bitta yozuv/kun)
//   • ko'p slotli kun → har slot uchun slot = startTime (mas. "14:00")
// group.startDate bo'lsa - undan oldingi kunlar hisoblanmaydi.
// holidaySet berilsa - bayram kunlari hisoblanmaydi.
export const getClassDaysInRange = (group, fromDate, toDate, holidaySet = null) => {
  const dayMap = new Map();
  for (const item of group?.schedule || []) {
    if (!dayMap.has(item.day)) dayMap.set(item.day, []);
    dayMap.get(item.day).push({ startTime: item.startTime, endTime: item.endTime });
  }
  // Slotlarni vaqt bo'yicha tartiblaymiz - "birinchi slot" deterministik bo'lsin
  // (slot-fallback eski slot="" yozuvini aynan birinchi slotga bog'laydi).
  for (const arr of dayMap.values())
    arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
  const startTs = group?.startDate ? toUtcMidnight(group.startDate).getTime() : null;
  const result = [];
  for (const d of iterateDays(fromDate, toDate)) {
    if (startTs !== null && d.getTime() < startTs) continue;
    const dow = dayOfWeekOf(d);
    const slots = dayMap.get(dow);
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

// Sana kurs oralig'ida (startDate..finishedAt, ikkalasi inclusive) ekanligini tekshiradi
export const withinCourseBounds = (group, date) => {
  const t = toUtcMidnight(date).getTime();
  if (group?.startDate && t < toUtcMidnight(group.startDate).getTime()) return false;
  if (group?.finishedAt && t > toUtcMidnight(group.finishedAt).getTime()) return false;
  return true;
};

// Berilgan sana bayram kunimi (dateKey holidaySet ichida bormi)
export const isHolidayOn = (holidaySet, date) =>
  !!holidaySet && holidaySet.has(dateKeyOf(date));

// O'quvchi shu sanada muzlatilganmi (freeze oralig'ida). endDate=null → ochiq.
export const isFrozenOn = (freezes, date) => {
  const target = toUtcMidnight(date).getTime();
  return (freezes || []).some((f) => {
    if (f.isActive === false) return false;
    if (target < toUtcMidnight(f.startDate).getTime()) return false;
    if (f.endDate && target > toUtcMidnight(f.endDate).getTime()) return false;
    return true;
  });
};
