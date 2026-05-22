import { getLinkedUser } from "../services/botUser.service.js";
import { ROLES } from "../../constants/roles.js";
import { getMyCurrentMonth } from "../../modules/salaries/services/salaries.service.js";
import { formatMoney } from "../utils/format.js";

const MONTH_LABELS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

const STATUS_LABEL = {
  calculated: "Hisoblangan",
  approved: "Tasdiqlangan",
  partial: "Qisman to'langan",
  paid: "To'liq to'langan",
};

const mySalaryHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const linked = await getLinkedUser(msg.from.id);

  if (!linked || linked.role !== ROLES.TEACHER) {
    await bot.sendMessage(chatId, "Bu funksiya faqat o'qituvchilar uchun.");
    return;
  }

  const { salary, payouts, period } = await getMyCurrentMonth(linked._id);
  const monthName = MONTH_LABELS[period.month - 1];

  if (!salary) {
    await bot.sendMessage(
      chatId,
      `${monthName} ${period.year} uchun oylik hali hisoblanmagan.`,
    );
    return;
  }

  const remaining = (salary.finalAmount || 0) - (salary.paidAmount || 0);
  const lines = [
    `${monthName} ${period.year} oyligi`,
    `Holati: ${STATUS_LABEL[salary.status] || salary.status}`,
    `Hisoblangan: ${formatMoney(salary.baseAmount)}`,
  ];
  if (salary.bonusTotal > 0) {
    lines.push(`+ Bonus: ${formatMoney(salary.bonusTotal)}`);
  }
  if (salary.penaltyTotal > 0) {
    lines.push(`− Jarima: ${formatMoney(salary.penaltyTotal)}`);
  }
  if (salary.advanceTotal > 0) {
    lines.push(`− Avans: ${formatMoney(salary.advanceTotal)}`);
  }
  if (salary.deductionTotal > 0) {
    lines.push(`− Ushlangan: ${formatMoney(salary.deductionTotal)}`);
  }
  lines.push(`Yakuniy: ${formatMoney(salary.finalAmount)}`);
  lines.push(`To'langan: ${formatMoney(salary.paidAmount)}`);
  lines.push(`Qoldiq: ${formatMoney(Math.max(0, remaining))}`);

  if (payouts.length > 0) {
    lines.push("\nSo'nggi to'lovlar:");
    for (const p of payouts.slice(0, 5)) {
      const d = new Date(p.paidAt).toLocaleDateString("uz-UZ");
      const method = p.method?.name || "-";
      lines.push(`• ${d} - ${formatMoney(p.amount)} (${method})`);
    }
  }

  await bot.sendMessage(chatId, lines.join("\n"));
};

export default mySalaryHandler;
