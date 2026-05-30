import mongoose from "mongoose";
import { ALL_ROLES, ROLES } from "../constants/roles.js";

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

    // Profil ma'lumotlari (ixtiyoriy)
    birthDate: { type: Date, default: null },
    gender: { type: String, enum: ["male", "female"], default: null },

    // Faqat student rolidagi maydonlar
    address: { type: String, trim: true, default: "" },
    parentName: { type: String, trim: true, default: "" },
    parentPhone: { type: String, trim: true, default: "" },
    enrolledAt: { type: Date, default: null },
    leadSource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadSource",
      default: null,
    },

    // Faqat teacher rolidagi maydon
    hiredAt: { type: Date, default: null },
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

const User = mongoose.model("User", userSchema);

export default User;
