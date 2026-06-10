import mongoose from "mongoose";

// Instanslararo bo'linadigan kesh (MongoDB orqali). In-process Map o'rniga -
// ko'p-instansli deploy'da ham invalidate hamma instansga ta'sir qiladi.
// expiresAt TTL indeksi orqali avtomatik tozalanadi.
const cacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL: expiresAt o'tgach hujjat avtomatik o'chiriladi
cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Cache = mongoose.model("Cache", cacheSchema);

export default Cache;
