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

  const hash = (params.get("hash") || "").toLowerCase();
  if (!hash) return { ok: false, reason: "no-hash" };

  // Check-string'ni 4 variantda quramiz va token bilan QAYSI BIRI mos kelsa - ok.
  // Telegram versiyalari orasida 2 ta o'lcham bor:
  //   A) `signature` (Ed25519) maydoni HMAC hisobiga KIRADIMI yoki YO'QMI;
  //   B) qiymatlar DEKODLANGANmi (URLSearchParams) yoki XOM (encoded) holidami.
  // `URLSearchParams` qiymatlarni dekodlaydi va `+` ni bo'sh joyga aylantiradi -
  // ba'zi initData'larda bu check-string'ni buzadi, shuning uchun XOM variantni ham sinaymiz.

  // Dekodlangan variant: URLSearchParams orqali (qiymatlar dekodlangan).
  const buildDecoded = (excludeSignature) => {
    const p = new URLSearchParams(initData);
    p.delete("hash");
    if (excludeSignature) p.delete("signature");
    return [...p.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  };

  // XOM variant: initData'ni qo'lda parse qilamiz, qiymatlarni o'zgartirmaymiz (encoded holida).
  const rawPairs = initData
    .split("&")
    .map((part) => {
      const i = part.indexOf("=");
      return i === -1 ? [part, ""] : [part.slice(0, i), part.slice(i + 1)];
    })
    .filter(([k]) => k && k !== "hash");
  const buildRaw = (excludeSignature) =>
    rawPairs
      .filter(([k]) => !(excludeSignature && k === "signature"))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

  const candidates = [
    buildDecoded(true),
    buildDecoded(false),
    buildRaw(true),
    buildRaw(false),
  ];

  let computedSample = "";
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
      if (!computedSample) computedSample = computed;
      return computed === hash;
    });
  });

  if (!matches) {
    return {
      ok: false,
      reason: "bad-hash",
      // DIAGNOSTIKA (keyin olib tashlanadi): nega mos kelmaganini ko'rish uchun.
      debug: {
        receivedHash: hash,
        computedHash: computedSample,
        keys: [...params.keys()].sort().join(","),
        checkStringHead: candidates[0].slice(0, 80),
      },
    };
  }

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
