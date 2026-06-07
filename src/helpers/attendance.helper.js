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

// ─── Mahalliy vaqt zonasi (Asia/Tashkent = UTC+5, DST yo'q) ───
// Server qaysi vaqt zonasida ishlashidan qat'i nazar "bugun" mahalliy kalendar
// kuni bo'yicha hisoblanadi. Aks holda yarim tundan keyin (00:00–05:00 mahalliy)
// "bugun" UTC bo'yicha kechagi kun bo'lib qolib, davomat belgilash rad etiladi.
export const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN || 300);

const shiftToLocal = (instant) =>
  new Date(new Date(instant).getTime() + TZ_OFFSET_MIN * 60 * 1000);

// Mahalliy kalendar kuni (UTC-midnight ko'rinishida — saqlangan dateKey bilan mos)
export const localTodayMidnight = (now = new Date()) => {
  const s = shiftToLocal(now);
  return new Date(
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0),
  );
};

export const localTodayKey = (now = new Date()) => dateKeyOf(shiftToLocal(now));

export const localDayOfWeek = (now = new Date()) => dayOfWeekOf(shiftToLocal(now));

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

// Guruh schedule asosida diapazondagi class kunlar.
// group.startDate bo'lsa — undan oldingi kunlar dars kuni hisoblanmaydi.
// holidaySet (dateKey larning Set'i) berilsa — bayram kunlari dars kuni
// hisoblanmaydi (davomat foiziga ta'sir qilmaydi).
export const getClassDaysInRange = (group, fromDate, toDate, holidaySet = null) => {
  const dayMap = new Map();
  for (const item of group?.schedule || []) {
    if (!dayMap.has(item.day)) dayMap.set(item.day, []);
    dayMap.get(item.day).push({ startTime: item.startTime, endTime: item.endTime });
  }
  const startTs = group?.startDate ? toUtcMidnight(group.startDate).getTime() : null;
  const result = [];
  for (const d of iterateDays(fromDate, toDate)) {
    if (startTs !== null && d.getTime() < startTs) continue;
    const dow = dayOfWeekOf(d);
    const slots = dayMap.get(dow);
    if (!slots) continue;
    const dKey = dateKeyOf(d);
    if (holidaySet && holidaySet.has(dKey)) continue;
    result.push({
      date: d,
      dateKey: dKey,
      dayOfWeek: dow,
      slots,
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
