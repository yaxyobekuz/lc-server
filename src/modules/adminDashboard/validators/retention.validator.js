import { z } from "zod";

export const retentionSchema = z.object({
  query: z.object({
    // leftAt diapazoni (ixtiyoriy) - berilmasa butun tarix.
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  }),
});
