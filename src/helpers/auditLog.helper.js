// Audit log helper: sanitize body, extract resource, truncate

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "refreshtoken",
  "accesstoken",
  "secret",
  "pin",
  "cvv",
  "initdata",
]);

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 5;

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export const sanitize = (input, depth = 0) => {
  if (depth > MAX_DEPTH) return "[MAX_DEPTH]";
  if (Array.isArray(input)) return input.map((it) => sanitize(it, depth + 1));
  if (!isPlainObject(input)) return input;

  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(String(k).toLowerCase())) {
      out[k] = REDACTED;
    } else if (isPlainObject(v) || Array.isArray(v)) {
      out[k] = sanitize(v, depth + 1);
    } else {
      out[k] = v;
    }
  }
  return out;
};

// Resource path mapping: /api/payment-methods → "paymentMethod"
const RESOURCE_MAP = {
  users: "user",
  groups: "group",
  feedback: "feedback",
  holidays: "holiday",
  notifications: "notification",
  "notification-templates": "notificationTemplate",
  "feedback-types": "feedbackType",
  attendance: "attendance",
  "attendance-exemptions": "attendanceExemption",
  "attendance-settings": "attendanceSettings",
  "activity-logs": "activityLog",
  "admin-dashboard": "adminDashboard",
  auth: "auth",
  "bot-auth": "botAuth",
};

const MONGO_ID_REGEX = /^[a-f0-9]{24}$/i;

export const extractResource = (originalUrl) => {
  if (!originalUrl) return { type: "", id: "" };
  // Strip query string
  const path = String(originalUrl).split("?")[0];
  // /api/users/abc123 yoki /users/abc/students/xyz
  const parts = path.split("/").filter(Boolean);
  // /api prefix bo'lsa olib tashla
  if (parts[0] === "api") parts.shift();
  if (!parts.length) return { type: "", id: "" };

  const type = RESOURCE_MAP[parts[0]] || parts[0];
  // Birinchi MongoDB ID ko'rinishidagi qismni resourceId qilish
  let id = "";
  for (let i = 1; i < parts.length; i += 1) {
    if (MONGO_ID_REGEX.test(parts[i])) {
      id = parts[i];
      break;
    }
  }
  return { type, id };
};

export const truncateBody = (body, maxBytes = 10240) => {
  if (body == null) return null;
  try {
    const str = JSON.stringify(body);
    if (str.length > maxBytes) {
      return { truncated: true, size: str.length };
    }
    return body;
  } catch {
    return { truncated: true, size: 0 };
  }
};
