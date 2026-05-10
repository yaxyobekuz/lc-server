export const requestContactKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: "Telefon raqamni yuborish", request_contact: true }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};

export const removeKeyboard = {
  reply_markup: { remove_keyboard: true },
};
