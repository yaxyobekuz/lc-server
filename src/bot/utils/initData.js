import crypto from "crypto";

// Telegram WebApp initData HMAC tekshiruvi.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export const verifyInitData = (initData, botToken, maxAgeSec = 86400) => {
  const tokens = (Array.isArray(botToken) ? botToken : [botToken]).filter(Boolean);
  if (!initData || tokens.length === 0) {
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

  // Check-string'ni ikki variantda quramiz: `signature` SIZ va `signature` BILAN.
  // Turli Telegram versiyalari `signature` ni HMAC hisobiga kiritishi yoki kiritmasligi
  // mumkin - ikkalasini ham sinaymiz. Qaysi biri har qaysi token bilan mos kelsa - ok.
  const buildCheck = (excludeSignature) => {
    const p = new URLSearchParams(initData);
    p.delete("hash");
    if (excludeSignature) p.delete("signature");
    return [...p.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  };
  const candidates = [buildCheck(true), buildCheck(false)];

  const matches = tokens.some((token) => {
    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(token)
      .digest();
    return candidates.some((checkString) => {
      const computed = crypto
        .createHmac("sha256", secretKey)
        .update(checkString)
        .digest("hex");
      return computed === hash;
    });
  });

  if (!matches) return { ok: false, reason: "bad-hash" };

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
