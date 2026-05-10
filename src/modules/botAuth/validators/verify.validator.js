import { z } from "zod";

export const verifySchema = z.object({
  body: z.object({
    initData: z.string().min(10, "initData kerak"),
  }),
});
