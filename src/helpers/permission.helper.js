import Role from "../models/role.model.js";
import { ROLES } from "../constants/roles.js";

// Owner gets ["*"] (code-base rule: super-admin)
export const collectPermissions = async (role) => {
  if (role === ROLES.OWNER) return ["*"];
  const doc = await Role.findOne({ value: role }).populate("permissions");
  return (doc?.permissions || []).map((p) => p.key);
};

export const hasPermission = (permissions, key) => {
  if (!permissions) return false;
  if (permissions.includes("*")) return true;
  return permissions.includes(key);
};
