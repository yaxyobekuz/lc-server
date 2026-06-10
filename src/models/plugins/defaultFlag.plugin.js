// Lookup (select) modellariga "asosiy/default" bayrog'ini qo'shadi.
// Bitta hujjat default bo'lishi mumkin - yangisini belgilaganda eskisi tozalanadi.
export default function defaultFlagPlugin(schema) {
  schema.add({
    isDefault: { type: Boolean, default: false },
  });

  // Berilgan hujjatni default qiladi, qolganlaridan default'ni oladi.
  schema.statics.setDefault = async function (id) {
    const doc = await this.findById(id);
    if (!doc) return null;
    await this.updateMany(
      { _id: { $ne: doc._id }, isDefault: true },
      { $set: { isDefault: false } },
    );
    if (!doc.isDefault) {
      doc.isDefault = true;
      await doc.save();
    }
    return doc;
  };

  // Default bayrog'ini olib tashlaydi (hech biri default bo'lmaydi).
  schema.statics.clearDefault = async function (id) {
    const doc = await this.findById(id);
    if (!doc) return null;
    if (doc.isDefault) {
      doc.isDefault = false;
      await doc.save();
    }
    return doc;
  };
}
