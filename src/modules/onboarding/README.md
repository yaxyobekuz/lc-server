# Onboarding — mavjud tarixiy ma'lumotni import qilish

Tizimga yangi qo'shilgan o'quv markazlarning **tizimdan oldin boshlangan** guruhlari,
o'quvchilari va o'tgan oylardagi to'lovlarini bitta amalda kiritish moduli.

## Endpoint

```
POST /api/onboarding/import        (permission: onboarding.import)
```

Bitta **atomik (all-or-nothing)** so'rov: guruh + o'quvchilar + a'zoliklar + tarixiy
to'lovlar birga yaratiladi. Biror joyda xato bo'lsa — hech narsa yozilmaydi (rollback).

### Body

```jsonc
{
  "idempotencyKey": "uuid",          // double-click/retry himoyasi (majburiy)
  "group": {
    "name": "Frontend",
    "startDate": "2026-04-10",        // O'TMISHDAGI sana bo'lishi mumkin
    "durationMonths": 5,
    "monthlyPrice": 500000,
    "teacherId": "…",                 // ixtiyoriy
    "schedule": [{ "day": "mon", "startTime": "14:00", "endTime": "15:30" }]
  },
  "students": [
    {
      "firstName": "Ali", "lastName": "Valiyev",
      "phone": "998901234567",
      "username": "ali_v", "password": "secret123",
      "joinDate": "2026-04-10",       // kursga o'rtadan qo'shilganlar uchun tahrirlanadi
      "priceOverride": null,          // ixtiyoriy individual narx
      "existingStudentId": null,      // mavjud o'quvchini bog'lash (dublikat o'rniga)
      "payments": [                   // faqat TO'LANGAN oylar
        { "year": 2026, "month": 4, "amount": 250000, "method": "cash" },
        { "year": 2026, "month": 5, "amount": 500000, "method": "cash" }
      ]
    }
  ]
}
```

### Javob

```jsonc
{
  "success": true,
  "data": {
    "duplicate": false,               // true → takror so'rov, ma'lumot qayta yozilmadi
    "group": { "_id": "…", "name": "Frontend", "startDate": "…" },
    "summary": {
      "studentsCreated": 9, "studentsLinked": 1,
      "paymentsCreated": 27, "transactionsCreated": 18,
      "totalCollected": 9000000
    },
    "students": [
      { "student": "…", "collected": 750000, "expected": 750000, "debt": 0 }
    ]
  }
}
```

### Xatolar

- **422 `IMPORT_ROW_ERRORS`** — qator-darajadagi validatsiya. `details` massivida har
  bir xato `{ path, message }` ko'rinishida (mas. `students.4.phone`). UI shu `path`
  bo'yicha aniq katakni qizil qiladi.
- **409 `IMPORT_IN_PROGRESS`** — bir xil `idempotencyKey` bilan boshqa so'rov hali
  bajarilmoqda yoki muvaffaqiyatsiz tugagan.

## Idempotentlik

Birinchi qadamda `ImportBatch` yozuvi `idempotencyKey` (unique index) bilan band
qilinadi. Bir xil kalitli **takror so'rov** (double-click / refresh / retry):

- batch `completed` → **yangi ma'lumot yaratilmaydi**, birinchi importning saqlangan
  natijasi qaytariladi (`duplicate: true`).
- batch `pending` → 409 (boshqa so'rov hali ishlayapti).

Validatsiya o'tmasa yoki tranzaksiya rollback bo'lsa — band qilingan batch o'chiriladi,
kalit bo'shaydi, owner tuzatib qayta yuborishi mumkin.

## Atomiklik

MongoDB **replica set** bo'lsa — `session.startTransaction()` ichida (haqiqiy atomik).
Standalone Mongo (tranzaksiyani qo'llab-quvvatlamaydi) bo'lsa — **sequential fallback**:
sessiyasiz yoziladi, xato bo'lsa yaratilgan barcha yozuvlar teskari tartibda qo'lda
o'chiriladi (`transferStudent` bilan bir xil pattern). Ikkala holatda ham natija
"to'liq yoki umuman" bo'ladi.

---

# Import qilingan o'quvchilar uchun QARZ qanday hisoblanadi

Import **mavjud finance mantiqini buzmaydi** — aynan shu modullar (proration helper,
`StudentPayment`, `PaymentTransaction`) ishlatiladi, shuning uchun dashboard va qarz
hisobotlari import bilanoq to'g'ri ko'rsatadi.

### 1. Qaysi oylar?

Guruh `startDate` dan **bugungacha** o'tgan har bir oy uchun ustun yaratiladi
(`elapsedMonths`). Masalan `startDate = 2026-04-10`, bugun `2026-06-11` → **Aprel, May,
Iyun**. O'quvchi uchun esa faqat uning `joinDate` oyidan boshlab ustunlar faol bo'ladi
(o'rtadan qo'shilganlar uchun oldingi oylar hisoblanmaydi).

### 2. Har oy uchun KUTILGAN summa (`expectedAmount`)

Har oyga `GroupFee` (= `monthlyPrice`) yoziladi. So'ng mavjud
`computePaymentSnapshot()` chaqirilib `StudentPayment.expectedAmount` hisoblanadi:

```
expectedAmount = round(monthlyPrice × proratsiyaFaktori) − chegirma
```

- **Proratsiya** — boshlanish oyida (yoki o'quvchi o'rtadan qo'shilgan oyda) faqat
  qatnashilgan kunlar hisoblanadi:
  `faktor = (qo'shilgan_kundan_oy_oxirigacha_kunlar) / oydagi_jami_kunlar`.
  Boshlanish oyida `GroupFee.effectiveFrom = startDate` qilib qo'yilgani uchun
  o'sha oy avtomatik proratsiyalanadi.
- **Individual narx (`priceOverride`)** — agar o'quvchi narxi guruh narxidan past bo'lsa,
  farqi (`monthlyPrice − priceOverride`) **doimiy `fixed` chegirma** sifatida yoziladi.
  Snapshotda ham shu chegirma qo'llanadi.

### 3. Har oy uchun TO'LANGAN summa (`paidAmount`)

To'langan deb belgilangan katakcha uchun **tarixiy `PaymentTransaction`** yaratiladi:

- `amount` = katakdagi summa (qisman to'lov ham mumkin),
- `paidAt` = o'sha oyning sanasi (boshlanish/qo'shilgan oyda — aniq `joinDate`; aks
  holda oy 1-kuni) — shuning uchun kirim **to'g'ri oyga** tegishli bo'ladi,
- `imported: true`, `importedAt`, `importBatch` — audit uchun real kassa kiriminidan
  ajratiladi.

`StudentPayment.paidAmount` shu summaga teng qilib yoziladi, `status` esa:
`paidAmount <= 0 → unpaid`, `< expected → partial`, aks holda `paid`.

### 4. QARZ

Qarz alohida saqlanmaydi — **hisoblab chiqariladi** (mavjud tizimdagi kabi):

```
oy_qarzi   = max(0, expectedAmount − paidAmount)
umumiy_qarz = Σ (barcha oylar bo'yicha oy_qarzi)
```

Demak import qilingan o'quvchi qarzi keyingi oylarda yangi to'lov qabul qilingani
(`PaymentTransaction` → `applyPaidDelta`) yoki fee/chegirma o'zgargani (`recalc`) bilan
mavjud finance oqimi orqali avtomatik yangilanadi — import hech qanday alohida
"qarz" maydonini kiritmaydi.

### Misol (task'dagi Frontend guruhi)

500 000 so'm/oy, 2026-04-01 dan, o'quvchi Aprel + May to'lagan, Iyun yo'q:

| Oy    | Kutilgan | To'langan | Qarz    |
|-------|----------|-----------|---------|
| Aprel | 500 000  | 500 000   | 0       |
| May   | 500 000  | 500 000   | 0       |
| Iyun  | 500 000  | 0         | 500 000 |
| **Jami** | **1 500 000** | **1 000 000** | **500 000** |

> Bu hisob `onboarding.test.js` da test bilan qoplangan (`node --test`).
