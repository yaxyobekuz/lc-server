import mongoose from "mongoose";
import { ALL_ROLES, ROLES } from "../constants/roles.js";

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, required: true },
    username: { type: String, trim: true, unique: true, required: true, lowercase: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ALL_ROLES, default: ROLES.STUDENT, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);

export default User;
