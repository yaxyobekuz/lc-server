import {
  getLinkedUser,
  getFlowState,
  setFlowState,
  clearFlowState,
} from "../services/botUser.service.js";
import { list as listFeedbackTypes } from "../../modules/feedbackTypes/services/feedbackTypes.service.js";
import { submit as submitFeedback } from "../../modules/feedback/services/feedback.service.js";

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const buildTypesKeyboard = (types) => {
  const buttons = types.map((t) => ({
    text: t.name,
    callback_data: `fb:type:${t._id}`,
  }));
  const grid = chunk(buttons, 2);
  grid.push([{ text: "❌ Bekor qilish", callback_data: "fb:cancel" }]);
  return { inline_keyboard: grid };
};

const ANON_KEYBOARD = {
  inline_keyboard: [
    [
      { text: "🕶 Anonim", callback_data: "fb:anon:yes" },
      { text: "👤 Ismim ko'rinadi", callback_data: "fb:anon:no" },
    ],
    [{ text: "❌ Bekor qilish", callback_data: "fb:cancel" }],
  ],
};

// Entry: "Feedback" tugmasiga
export const feedbackEntryHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const tgId = msg.from.id;
  const linked = await getLinkedUser(tgId);

  if (!linked) {
    await bot.sendMessage(
      chatId,
      "Avval /start ni bosing va telefon raqamingizni yuboring.",
    );
    return;
  }

  const { items: types } = await listFeedbackTypes({ limit: 50 });
  if (!types.length) {
    await bot.sendMessage(chatId, "Hozircha feedback turlari mavjud emas.");
    return;
  }

  await setFlowState(tgId, {
    type: "feedback",
    step: "awaiting_type",
    data: {},
  });

  await bot.sendMessage(chatId, "Feedback turini tanlang:", {
    reply_markup: buildTypesKeyboard(types),
  });
};

// Callback handler: fb:type:* / fb:anon:* / fb:cancel
export const feedbackCallbackHandler = async (bot, query) => {
  const data = String(query?.data || "");
  const tgId = query.from.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;

  // ack
  await bot.answerCallbackQuery(query.id).catch(() => null);

  const linked = await getLinkedUser(tgId);
  if (!linked) {
    if (chatId) {
      await bot.sendMessage(
        chatId,
        "Avval /start ni bosing va telefon raqamingizni yuboring.",
      );
    }
    return;
  }

  if (data === "fb:cancel") {
    await clearFlowState(tgId);
    if (chatId) {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId },
      ).catch(() => null);
      await bot.sendMessage(chatId, "❌ Feedback bekor qilindi.");
    }
    return;
  }

  if (data.startsWith("fb:type:")) {
    const typeId = data.slice("fb:type:".length);
    if (!typeId) return;

    await setFlowState(tgId, {
      type: "feedback",
      step: "awaiting_message",
      data: { typeId },
    });

    if (chatId) {
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId },
      ).catch(() => null);
      await bot.sendMessage(
        chatId,
        "Endi feedback matnini yozib yuboring (kamida 5 belgi). Bekor qilish uchun /cancel.",
      );
    }
    return;
  }

  if (data === "fb:anon:yes" || data === "fb:anon:no") {
    const state = await getFlowState(tgId);
    if (!state || state.step !== "awaiting_anonymity" || !state.data?.message) {
      await bot.sendMessage(
        chatId,
        "Sessiya muddati tugagan, qaytadan 'Feedback' tugmasini bosing.",
      );
      await clearFlowState(tgId);
      return;
    }

    const isAnonymous = data === "fb:anon:yes";
    try {
      await submitFeedback(
        {
          type: state.data.typeId,
          message: state.data.message,
          isAnonymous,
        },
        { _id: linked._id, role: linked.role },
      );
      await clearFlowState(tgId);
      if (chatId) {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: messageId },
        ).catch(() => null);
        await bot.sendMessage(chatId, "✅ Feedback yuborildi. Rahmat!");
      }
    } catch (err) {
      await bot.sendMessage(
        chatId,
        `Xatolik: ${err?.message || "feedbackni yuborib bo'lmadi"}`,
      );
    }
  }
};

// Text step handler: awaiting_message bosqichida text matn keladi
// Returns true agar handle qilingan bo'lsa.
export const feedbackTextHandler = async (bot, msg) => {
  if (!msg?.text) return false;
  const tgId = msg.from.id;
  const state = await getFlowState(tgId);
  if (!state || state.type !== "feedback") return false;
  if (state.step !== "awaiting_message") return false;

  const message = String(msg.text).trim();
  if (message.length < 5) {
    await bot.sendMessage(
      msg.chat.id,
      "Matn juda qisqa. Kamida 5 belgi bo'lishi kerak. Qaytadan yuboring yoki /cancel.",
    );
    return true; // handled (state qoladi)
  }

  await setFlowState(tgId, {
    type: "feedback",
    step: "awaiting_anonymity",
    data: { ...state.data, message },
  });

  await bot.sendMessage(
    msg.chat.id,
    "Feedback'ni qanday yuborish kerak?",
    { reply_markup: ANON_KEYBOARD },
  );
  return true;
};

export default feedbackEntryHandler;
