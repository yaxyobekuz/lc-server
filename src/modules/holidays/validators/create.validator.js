import { z } from "zod";

export const createSchema = z.object({
  body: z
    .object({
      name: z.string().min(1, "Nom kerak").max(120),
      isRecurring: z.boolean().optional(),
      month: z.coerce.number().int().min(1).max(12),
      day: z.coerce.number().int().min(1).max(31),
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      message: z.string().min(1, "Tabrik matni kerak").max(2000),
      audience: z.enum(["all", "students", "teachers"]).optional(),
    })
    .superRefine((b, ctx) => {
      const isRecurring = b.isRecurring !== false;
      if (!isRecurring && !b.year) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["year"],
          message: "Bir martalik bayram uchun yil kerak",
        });
      }
    }),
});
