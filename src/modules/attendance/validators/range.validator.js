import { z } from "zod";

export const rangeQuerySchema = z.object({
  query: z.object({
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
  }),
});

export const studentRangeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
  }),
});

export const groupRangeSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
  }),
});
