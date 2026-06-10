import Cache from "../models/cache.model.js";

// Davomat↔to'lov korrelatsiya hisobotining MongoDB-backed keshi.
// Ko'p-instansli deploy'da bo'linadi: bir instansda invalidate qilinsa,
// barcha instanslar yangi ma'lumotni oladi (in-process Map muammosi yo'q).
const PREFIX = "correlation:";
const TTL_MS = 5 * 60 * 1000;

export const correlationCacheGet = async (key) => {
  try {
    const doc = await Cache.findOne({ key: PREFIX + key }).lean();
    if (doc && doc.expiresAt > new Date()) return doc.value;
  } catch {
    /* kesh xatosi - shunchaki cache-miss deb hisoblaymiz */
  }
  return null;
};

export const correlationCacheSet = async (key, data) => {
  try {
    await Cache.updateOne(
      { key: PREFIX + key },
      { $set: { value: data, expiresAt: new Date(Date.now() + TTL_MS) } },
      { upsert: true },
    );
  } catch {
    /* kesh yozib bo'lmadi - muhim emas */
  }
};

// Sinxron chaqiruvchilar uchun ham xavfsiz: promise qaytaradi, ichida try/catch
// (await qilinmasa ham unhandled rejection bermaydi).
export const correlationCacheInvalidate = async (year, month) => {
  try {
    if (year && month) {
      await Cache.deleteOne({ key: `${PREFIX}${year}-${month}` });
    } else {
      await Cache.deleteMany({ key: new RegExp(`^${PREFIX}`) });
    }
  } catch {
    /* noop */
  }
};
