import { z } from "zod";

export const cashflowSchema = z.object({
  query: z.object({
    range: z.enum(["week", "month", "year"]).optional(),
  }),
});
