import crypto from "crypto";

// Telegram WebApp initData HMAC tekshiruvi.
// Algoritm: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export const verifyInitData = (initData, botToken, maxAgeSec = 86400) => {
  if (!initData || !botToken) {
    return { ok: false, reason: "missing-input" };
  }

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "bad-format" };
  }

  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "no-hash" };
  params.delete("hash");
  // `signature` (Ed25519, uchinchi tomon validatsiyasi uchun) HMAC check-string'ga
  // KIRMAYDI - Telegram spetsifikatsiyasi bo'yicha uni ham olib tashlaymiz, aks holda
  // computed hash mos kelmaydi.
  params.delete("signature");

  // Alfavit tartibida key=value\n... ko'rinishida birlashtiramiz
  const checkArr = [];
  for (const [k, v] of [...params.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    checkArr.push(`${k}=${v}`);
  }
  const checkString = checkArr.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  if (computed !== hash) return { ok: false, reason: "bad-hash" };

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate) return { ok: false, reason: "no-auth-date" };
  if (Date.now() / 1000 - authDate > maxAgeSec) {
    return { ok: false, reason: "expired" };
  }

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    return { ok: false, reason: "bad-user" };
  }
  if (!user?.id) return { ok: false, reason: "no-user" };

  return { ok: true, user, authDate };
};
