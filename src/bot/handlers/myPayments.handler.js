import { getLinkedUser } from "../services/botUser.service.js";
import { ROLES } from "../../constants/roles.js";
import { formatMoney } from "../utils/format.js";
import * as paymentsService from "../../modules/payments/services/payments.service.js";

const formatPeriod = (period) => {
  if (!period) return "-";
  const m = String(period.month).padStart(2, "0");
  return `${m}.${period.year}`;
};

const formatDate = (d) => {
  if (!d) return "-";
  const date = new Date(d);
  return date.toLocaleDateString("uz-UZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const myPaymentsHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const linked = await getLinkedUser(msg.from.id);

  if (!linked || linked.role !== ROLES.STUDENT) {
    await bot.sendMessage(chatId, "Bu funksiya faqat o'quvchilar uchun.");
    return;
  }

  const summary = await paymentsService.getStudentSummary(linked._id);

  const lines = [
    `Joriy qarz: ${formatMoney(summary.currentDebt)}`,
    `Jami to'langan: ${formatMoney(summary.totalPaid)}`,
  ];
  if (summary.lastPaymentAt) {
    lines.push(`Oxirgi to'lov: ${formatDate(summary.lastPaymentAt)}`);
  }
  if (summary.oldestUnpaidPeriod) {
    lines.push(`Eng eski qarz: ${formatPeriod(summary.oldestUnpaidPeriod)}`);
  }
  if (summary.openInvoicesCount > 0) {
    lines.push(`Ochiq hisoblar: ${summary.openInvoicesCount} ta`);
  }

  await bot.sendMessage(chatId, lines.join("\n"));
};

export default myPaymentsHandler;
