import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true, lowercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    group: { type: String, default: "general", trim: true, lowercase: true },
  },
  { timestamps: true },
);

const Permission = mongoose.model("Permission", permissionSchema);

export default Permission;
