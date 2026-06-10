import { z } from "zod";

export const reportSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    action: z.enum(["archive", "restore"]).optional(),
  }),
});
