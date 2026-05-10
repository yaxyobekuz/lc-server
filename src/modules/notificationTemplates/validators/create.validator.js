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

export const createSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Nom kerak").max(120),
    body: z.string().min(1, "Matn kerak").max(2000),
    category: z.enum(CATEGORIES).optional(),
  }),
});
