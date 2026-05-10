import { z } from "zod";

export const listForDateSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    date: z.coerce.date(),
  }),
});
