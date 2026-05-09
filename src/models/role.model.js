import mongoose from "mongoose";
import { ALL_ROLES } from "../constants/roles.js";

// Hozircha 3 ta statik rol — bu collectionda har rol uchun bitta yozuv (permission-larni saqlash uchun)
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
