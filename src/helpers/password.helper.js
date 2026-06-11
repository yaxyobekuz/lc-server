// DIQQAT: loyiha talabiga ko'ra parollar OCHIQ MATNDA saqlanadi (hash YO'Q).
// hashPassword parolni o'zgartirmasdan qaytaradi, comparePassword esa oddiy
// matn solishtiruvini bajaradi. (Maydon nomi tarixiy sabablarga ko'ra
// passwordHash bo'lib qoldi - ichida ochiq parol turadi.)

export const hashPassword = async (plain) => String(plain);

export const comparePassword = async (plain, stored) =>
  String(plain) === String(stored);
