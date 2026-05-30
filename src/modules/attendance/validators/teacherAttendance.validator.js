import { z } from "zod";

export const teacherStatusSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({ date: z.coerce.date() }),
});

export const teacherSetSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  body: z.object({
    date: z.coerce.date(),
    present: z.coerce.boolean(),
  }),
});
