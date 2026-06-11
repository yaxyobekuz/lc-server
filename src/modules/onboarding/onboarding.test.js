// Node ichki test runner (node --test) - yangi kutubxona qo'shilmaydi.
// Ishga tushirish:  node --test src/modules/onboarding/onboarding.test.js
import test from "node:test";
import assert from "node:assert/strict";

import {
  monthKey,
  elapsedMonths,
  historicalPaidAt,
} from "./services/onboarding.helper.js";
import {
  computePaymentSnapshot,
  deriveStatus,
} from "../finance/services/proration.helper.js";

// ── elapsedMonths: matritsa ustunlari ────────────────────────────────────────

test("elapsedMonths: 2 oy oldin boshlangan kurs → 3 ustun (boshlanish + 2)", () => {
  // Task'dagi aniq misol: 2026-04-10 boshlangan, bugun 2026-06-11
  const months = elapsedMonths("2026-04-10", "2026-06-11");
  assert.deepEqual(months, [
    { year: 2026, month: 4 },
    { year: 2026, month: 5 },
    { year: 2026, month: 6 },
  ]);
});

test("elapsedMonths: bir oy ichida boshlangan → faqat bitta ustun", () => {
  const months = elapsedMonths("2026-06-01", "2026-06-11");
  assert.deepEqual(months, [{ year: 2026, month: 6 }]);
});

test("elapsedMonths: yil chegarasidan o'tadi (Nov 2025 → Feb 2026)", () => {
  const months = elapsedMonths("2025-11-15", "2026-02-03");
  assert.deepEqual(months, [
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
  ]);
});

test("monthKey: monoton o'sadi va yil chegarasida uzluksiz", () => {
  assert.equal(monthKey(2026, 1) - monthKey(2025, 12), 1);
  assert.ok(monthKey(2026, 5) > monthKey(2026, 4));
});

// ── historicalPaidAt: tarixiy to'lov sanasi ──────────────────────────────────

test("historicalPaidAt: qo'shilgan oy uchun aniq joinedAt kunini beradi", () => {
  const joined = new Date(Date.UTC(2026, 3, 10)); // 2026-04-10
  const paidAt = historicalPaidAt(2026, 4, joined);
  assert.equal(paidAt.getTime(), joined.getTime());
});

test("historicalPaidAt: keyingi oylar uchun oy 1-kunini beradi", () => {
  const joined = new Date(Date.UTC(2026, 3, 10));
  const paidAt = historicalPaidAt(2026, 5, joined);
  assert.equal(paidAt.getTime(), Date.UTC(2026, 4, 1));
});

// ── Integratsiya: import qarzni to'g'ri hisoblaydimi (mavjud finance mantiqi) ─

test("snapshot: to'liq oy, chegirmasiz → expected = guruh narxi", () => {
  const snap = computePaymentSnapshot({
    baseFee: 500000,
    year: 2026,
    month: 5,
    joinedAt: new Date(Date.UTC(2026, 3, 1)),
    leftAt: null,
    freezes: [],
    discounts: [],
  });
  assert.equal(snap.expectedAmount, 500000);
});

test("snapshot: oy o'rtasida qo'shilgan → proratsiyalangan expected (< to'liq)", () => {
  // 2026-04-16 da qo'shilgan, aprel boshlanish oyi (effectiveFrom = startDate)
  const start = new Date(Date.UTC(2026, 3, 16));
  const snap = computePaymentSnapshot({
    baseFee: 500000,
    year: 2026,
    month: 4,
    joinedAt: start,
    leftAt: null,
    freezes: [],
    discounts: [],
    effectiveFrom: start,
  });
  // Aprel 30 kun, 16..30 = 15 kun → 500000 * 15/30 = 250000
  assert.equal(snap.expectedAmount, 250000);
});

test("snapshot: individual narx override fixed chegirma sifatida", () => {
  // Guruh narxi 500k, lekin bu o'quvchi 400k to'laydi → 100k fixed chegirma
  const snap = computePaymentSnapshot({
    baseFee: 500000,
    year: 2026,
    month: 5,
    joinedAt: new Date(Date.UTC(2026, 3, 1)),
    leftAt: null,
    freezes: [],
    discounts: [{ type: "fixed", value: 100000 }],
  });
  assert.equal(snap.expectedAmount, 400000);
});

test("debt: to'liq to'langan → qarz 0; qisman → qoldiq qarz", () => {
  const expected = 500000;
  // To'liq to'langan
  assert.equal(deriveStatus(500000, expected), "paid");
  assert.equal(Math.max(0, expected - 500000), 0);
  // Qisman: 300k to'langan
  assert.equal(deriveStatus(300000, expected), "partial");
  assert.equal(Math.max(0, expected - 300000), 200000);
  // To'lanmagan
  assert.equal(deriveStatus(0, expected), "unpaid");
  assert.equal(Math.max(0, expected - 0), 500000);
});

// ── Task misoli to'liq: 3 oy, qisman to'lovlar → umumiy qarz ──────────────────

test("integratsiya: Frontend guruhi misoli (3 oy) — umumiy qarz to'g'ri", () => {
  // 500k/oy, 2026-04-01 dan, 3 oy (Apr,May,Jun). O'quvchi Apr+May to'lagan, Jun yo'q.
  const months = elapsedMonths("2026-04-01", "2026-06-11");
  const joinedAt = new Date(Date.UTC(2026, 3, 1));
  const paidByKey = new Map([
    [monthKey(2026, 4), 500000],
    [monthKey(2026, 5), 500000],
    // Iyun to'lanmagan
  ]);

  let totalExpected = 0;
  let totalPaid = 0;
  for (const m of months) {
    const isStart = m.year === 2026 && m.month === 4;
    const snap = computePaymentSnapshot({
      baseFee: 500000,
      year: m.year,
      month: m.month,
      joinedAt,
      leftAt: null,
      freezes: [],
      discounts: [],
      effectiveFrom: isStart ? joinedAt : null,
    });
    totalExpected += snap.expectedAmount;
    totalPaid += paidByKey.get(monthKey(m.year, m.month)) || 0;
  }

  assert.equal(totalExpected, 1500000); // 3 × 500k
  assert.equal(totalPaid, 1000000); // 2 × 500k
  assert.equal(Math.max(0, totalExpected - totalPaid), 500000); // Iyun qarzi
});
