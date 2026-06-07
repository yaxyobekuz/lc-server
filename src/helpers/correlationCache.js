// Davomat↔to'lov korrelatsiya hisobotining in-process keshi.
// Alohida modul — attendance/invoices/payments/exemptions servislari
// import-tsikl hosil qilmasdan invalidate chaqira olishi uchun.
// DIQQAT: bu per-process kesh. Ko'p instansli deploy'da har instans o'z keshiga
// ega bo'ladi — invalidate boshqa instanslarga tarqamaydi (kelajakda Redis kerak).

const cache = new Map(); // `${year}-${month}` -> { data, expires }
const TTL_MS = 5 * 60 * 1000;

export const correlationCacheGet = (key) => {
  const c = cache.get(key);
  if (c && c.expires > Date.now()) return c.data;
  return null;
};

export const correlationCacheSet = (key, data) => {
  cache.set(key, { data, expires: Date.now() + TTL_MS });
};

export const correlationCacheInvalidate = (year, month) => {
  if (year && month) {
    cache.delete(`${year}-${month}`);
  } else {
    cache.clear();
  }
};
