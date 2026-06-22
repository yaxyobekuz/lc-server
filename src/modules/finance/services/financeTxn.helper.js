import mongoose from "mongoose";
import logger from "../../../config/logger.js";

// Moliyaviy ko'p-yozuvli amallarni ATOMIK qiladi. To'lov qabul qilish (create)
// va bekor qilish (remove) bir nechta hujjatga yozadi (PaymentTransaction +
// StudentPayment.paidAmount). Yarmida xato bo'lsa pul "yarim holatda" qolib
// ketmasligi uchun barchasini bitta MongoDB tranzaksiyasiga o'raymiz.
//
// MUHIM: MongoDB tranzaksiyasi faqat replica set / mongos'da ishlaydi. Standalone
// Mongo'da (replica set yo'q) startSession().withTransaction() xato beradi -
// shu holatda session=null bilan ketma-ket bajaramiz (atomiklik kafolati yo'q,
// lekin ishlash to'xtamaydi) - kod bazada o'rnatilgan pattern.
//
// work(session) - berilgan session bilan barcha yozuvlarni bajaradigan funksiya.
// Session berilgan barcha .create/.save/.findByIdAndUpdate'ga { session } sifatida
// uzatilishi shart, aks holda yozuv tranzaksiyadan tashqarida qoladi.
export const runFinanceTxn = async (work) => {
  let session;
  try {
    session = await mongoose.startSession();
  } catch {
    // Session umuman ochilmadi - standalone fallback
    return work(null);
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (err) {
    // Replica set bo'lmasa Mongo bu kodlar bilan rad etadi - sessiyasiz qayta urinamiz.
    const noTxnSupport =
      err?.code === 20 || // IllegalOperation: Transaction numbers ... require replica set
      err?.codeName === "IllegalOperation" ||
      /Transaction numbers are only allowed|replica set|Transactions are not supported/i.test(
        err?.message || "",
      );
    if (noTxnSupport) {
      logger.warn(
        { err },
        "MongoDB tranzaksiyasi qo'llab-quvvatlanmaydi - sessiyasiz (atomiksiz) bajarilmoqda",
      );
      return work(null);
    }
    throw err;
  } finally {
    session?.endSession();
  }
};
