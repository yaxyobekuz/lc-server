import { z } from "zod";

const CATEGORIES = [
  "payment",
  "debt",
  "class_cancel",
  "announcement",
  "holiday",
  "personal",
  "feedback_status",
  "custom",
];

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      body: z.string().min(1).max(2000).optional(),
      category: z.enum(CATEGORIES).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});
