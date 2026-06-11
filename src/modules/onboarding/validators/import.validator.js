import { z } from "zod";
import { scheduleArray } from "../../groups/validators/common.js";

// Bitta tarixiy to'lov katakchasi (matritsa hujayrasi). amount musbat butun son.
const cellSchema = z.object({
  year: z.coerce.number().int().min(2000).max(3000),
  month: z.coerce.number().int().min(1).max(12),
  amount: z.coerce.number().int().positive("To'lov summasi musbat bo'lishi kerak"),
  method: z.enum(["cash", "card"]).default("cash"),
});

// Bitta o'quvchi qatori. Yangi o'quvchi (username+password) yoki mavjudni bog'lash
// (existingStudentId). joinDate guruh boshlanish sanasidan oldin bo'lishi mumkin emas
// (server tomonida group.startDate bilan tekshiriladi).
const studentRowSchema = z
  .object({
    firstName: z.string().trim().min(1, "Ism kerak").max(60),
    lastName: z.string().trim().min(1, "Familiya kerak").max(60),
    phone: z.string().trim().min(9, "Telefon kerak"),
    // Owner jadvalda qo'lda kiritadi (login ma'lumotlari).
    username: z.string().trim().min(3, "Username kamida 3 belgi").max(40),
    password: z.string().min(6, "Parol kamida 6 belgi"),
    // Guruhga qo'shilgan sana - default group.startDate (mid-course joiners uchun
    // tahrirlanadi). Kelajakda bo'lmasligi kerak.
    joinDate: z.coerce.date(),
    // Individual narx override (ixtiyoriy) - bu o'quvchining shu guruhdagi tarifi
    // guruh standart narxidan farq qilsa, fixed chegirma sifatida qo'llanadi.
    priceOverride: z.coerce.number().int().min(0).nullable().optional(),
    // Mavjud o'quvchini bog'lash (dublikat yaratmaslik uchun). Berilsa
    // username/password e'tiborga olinmaydi, faqat a'zolik + to'lov yaratiladi.
    existingStudentId: z.string().trim().nullable().optional(),
    // Shu o'quvchining tarixiy to'lovlari (faqat to'langan oylar).
    payments: z.array(cellSchema).default([]),
  })
  .superRefine((row, ctx) => {
    // priceOverride bo'lganda payments amount'i unga moslashishi shart emas -
    // qisman to'lov ham bo'lishi mumkin; faqat amount > 0 talab qilinadi (cellSchema).
    void row;
    void ctx;
  });

export const importSchema = z.object({
  body: z.object({
    // Double-click/refresh/retry himoyasi uchun kliyent yaratadigan kalit (uuid).
    idempotencyKey: z.string().trim().min(8, "Idempotency kalit kerak").max(100),
    group: z.object({
      name: z.string().trim().min(2, "Guruh nomi kamida 2 belgi").max(120),
      // O'TMISHDAGI sana bo'lishi MUMKIN (onboarding'ning asosiy maqsadi).
      startDate: z.coerce.date(),
      durationMonths: z.coerce.number().int().min(1).max(60),
      monthlyPrice: z.coerce.number().int().min(0, "Narx manfiy bo'lmasin"),
      teacherId: z.string().trim().nullable().optional(),
      schedule: scheduleArray.default([]),
    }),
    students: z.array(studentRowSchema).min(1, "Kamida bitta o'quvchi kerak"),
  }),
});
