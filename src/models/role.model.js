import mongoose from "mongoose";
import { ALL_ROLES } from "../constants/roles.js";
// Permission modeli ref ishlatiladi - populate uchun registratsiya shart
import "./permission.model.js";

// One row per role (3 static roles today) - exists to attach permissions
const roleSchema = new mongoose.Schema(
  {
    value: { type: String, enum: ALL_ROLES, unique: true, required: true },
    label: { type: String, required: true, trim: true },
    permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],
  },
  { timestamps: true },
);

const Role = mongoose.model("Role", roleSchema);

export default Role;
