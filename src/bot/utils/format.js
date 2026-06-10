import { scheduleActiveOn } from "../../helpers/attendance.helper.js";

const DAY_LABELS = {
  mon: "Du",
  tue: "Se",
  wed: "Ch",
  thu: "Pa",
  fri: "Ju",
  sat: "Sh",
  sun: "Ya",
};

export const formatSchedule = (schedule = []) =>
  // Faqat bugun amal qilayotgan versiyani ko'rsatamiz (versiyalash)
  scheduleActiveOn(schedule)
    .map((s) => `${DAY_LABELS[s.day] || s.day} ${s.startTime}–${s.endTime}`)
    .join(", ") || "-";

export const formatMoney = (n) => {
  const num = Number(n) || 0;
  return `${num.toLocaleString("uz-UZ").replace(/,/g, " ")} so'm`;
};

export const formatPhone = (raw) => {
  const digits = String(raw || "").replace(/\D+/g, "");
  if (digits.length !== 12) return raw || "-";
  return `+${digits.slice(0, 3)} (${digits.slice(3, 5)}) ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10, 12)}`;
};
