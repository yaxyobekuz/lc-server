import { z } from "zod";

export const congratulateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // Yetkazish kanallari: "telegram" (tg orqali), "inapp" (platforma) - kamida bittasi.
    channels: z
      .array(z.enum(["inapp", "telegram"]))
      .min(1, "Kamida bitta kanal tanlang"),
    // Ixtiyoriy - berilmasa standart tabrik matni ishlatiladi.
    message: z.string().max(2000).optional(),
    title: z.string().max(200).optional(),
  }),
});
