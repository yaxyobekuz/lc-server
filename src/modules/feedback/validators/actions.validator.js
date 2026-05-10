import { z } from "zod";

export const replySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    message: z.string().min(1, "Javob matni kerak").max(2000),
  }),
});

export const resolveSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      adminReply: z.string().max(2000).optional(),
    })
    .default({}),
});

export const rejectSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    rejectionReason: z.string().min(1, "Sabab kerak").max(500),
  }),
});

export const rangeSchema = z.object({
  query: z.object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  }),
});
