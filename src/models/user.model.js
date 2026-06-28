import mongoose from "mongoose";
import { ALL_ROLES, ROLES } from "../constants/roles.js";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, required: true },
    username: { type: String, trim: true, unique: true, required: true, lowercase: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    // DIQQAT: loyiha talabiga ko'ra parol OCHIQ MATNDA saqlanadi (hash YO'Q).
    // Maydon nomi tarixiy sabablarga ko'ra passwordHash bo'lib qoldi, lekin
    // ichida ochiq parol turadi. select:false - oddiy so'rovlarda chiqmaydi,
    // owner uni faqat /:id/password endpoint orqali ataylab oladi.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ALL_ROLES, default: ROLES.STUDENT, required: true },
    isActive: { type: Boolean, default: true },
    // Arxivlangan (isActive=false qilingan) payt. Tiklanganda null bo'ladi.
    archivedAt: { type: Date, default: null },

    // Profil ma'lumotlari (ixtiyoriy)
    birthDate: { type: Date, default: null },
    gender: { type: String, enum: ["male", "female"], default: null },

    // Faqat student rolidagi maydon
    enrolledAt: { type: Date, default: null },
    // O'qishni yakunlagan sana (avtomatik yoki qo'lda). null = hali yakunlamagan.
    completedAt: { type: Date, default: null },
    // completedAt owner tomonidan qo'lda o'rnatilganmi - avto-recompute uni bosib o'tmaydi.
    completedAtManual: { type: Boolean, default: false },

    // Faqat teacher rolidagi maydon
    hiredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Rol HECH QACHON bo'sh bo'lmasligi kerak. Eski/buzilgan hujjat saqlanganda
// ham qiymatni kafolatlaymiz: noma'lum yoki bo'sh rol -> student.
userSchema.pre("validate", function ensureRole(next) {
  if (!this.role || !ALL_ROLES.includes(this.role)) {
    this.role = ROLES.STUDENT;
  }
  next();
});

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.plainPassword; // legacy hujjatlar uchun himoya
    delete ret.__v;
    return ret;
  },
});

userSchema.plugin(softDeletePlugin);

const User = mongoose.model("User", userSchema);

export default User;
