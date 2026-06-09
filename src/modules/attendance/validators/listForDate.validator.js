import { z } from "zod";
import { dateInputSchema, slotSchema } from "./shared.js";

export const listForDateSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    date: dateInputSchema,
    slot: slotSchema.optional(), // sessiya: "" yoki "HH:mm"
  }),
});
