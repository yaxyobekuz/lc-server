import { z } from "zod";

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const recipientListSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const inboxListSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    unreadOnly: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
  }),
});
