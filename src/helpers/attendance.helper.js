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

// Guruh schedule asosida diapazondagi class kunlar
export const getClassDaysInRange = (group, fromDate, toDate) => {
  const dayMap = new Map();
  for (const item of group?.schedule || []) {
    if (!dayMap.has(item.day)) dayMap.set(item.day, []);
    dayMap.get(item.day).push({ startTime: item.startTime, endTime: item.endTime });
  }
  const result = [];
  for (const d of iterateDays(fromDate, toDate)) {
    const dow = dayOfWeekOf(d);
    const slots = dayMap.get(dow);
    if (!slots) continue;
    result.push({
      date: d,
      dateKey: dateKeyOf(d),
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
