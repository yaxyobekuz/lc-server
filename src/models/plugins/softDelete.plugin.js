import mongoose from "mongoose";

// "Arxiv" (soft-delete) bayrog'i: o'chirish o'rniga isDeleted=true.
// Auto query-filter QO'YILMAYDI (aggregate/stats buzilmasligi uchun) -
// har bir servis ro'yxatda isDeleted ni ochiq filtrlaydi.
export default function softDeletePlugin(schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  });

  schema.methods.softDelete = function (userId) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId || null;
    return this.save();
  };

  schema.methods.restore = function () {
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    return this.save();
  };
}
