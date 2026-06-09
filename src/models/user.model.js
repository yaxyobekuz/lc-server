import mongoose from "mongoose";
import { ALL_ROLES, ROLES } from "../constants/roles.js";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, required: true },
    username: { type: String, trim: true, unique: true, required: true, lowercase: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    passwordHash: { type: String, required: true, select: false },
    // Owner panelida parolni ko'rsatish uchun ochiq nusxa (select:false)
    plainPassword: { type: String, default: "", select: false },
    role: { type: String, enum: ALL_ROLES, default: ROLES.STUDENT, required: true },
    isActive: { type: Boolean, default: true },

    // O'quvchi guruhlardan chiqib ketganda: qarzi bilan yoki to'lab chiqqani
    leaveStatus: {
      type: String,
      enum: ["left_unpaid", "left_paid"],
      default: null,
    },

    // Profil ma'lumotlari (ixtiyoriy)
    birthDate: { type: Date, default: null },
    gender: { type: String, enum: ["male", "female"], default: null },

    // Faqat student rolidagi maydonlar
    enrolledAt: { type: Date, default: null },
    // O'quvchi oldindan/ortiqcha to'lagan pul (keyingi oy hisoblaridan yechiladi)
    balance: { type: Number, default: 0, min: 0 },

    // Faqat teacher rolidagi maydon
    hiredAt: { type: Date, default: null },
    // O'qituvchi kelmagan kun jarimasi (o'qituvchi override). "inherit" → global sozlama.
    teacherAbsenceMode: {
      type: String,
      enum: ["inherit", "auto", "fixed", "none"],
      default: "inherit",
    },
    teacherAbsenceAmount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.plainPassword;
    delete ret.__v;
    return ret;
  },
});

userSchema.plugin(softDeletePlugin);

const User = mongoose.model("User", userSchema);

export default User;
