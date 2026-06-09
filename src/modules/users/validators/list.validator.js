import { z } from "zod";
import { ROLES } from "../../../constants/roles.js";

export const listSchema = z.object({
  query: z.object({
    role: z.enum([ROLES.OWNER, ROLES.TEACHER, ROLES.STUDENT]).optional(),
    search: z.string().optional(),
    archived: z.enum(["0", "1", "true", "false"]).optional(),
    sort: z.enum(["createdAt", "firstName", "lastName", "debt"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
