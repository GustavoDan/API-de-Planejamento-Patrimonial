import { z } from "zod";
import { createPaginatedResponseSchema } from "./shared.schema";

export const familyMemberSchema = z.object({
  relationship: z.enum(["PARTNER", "CHILD", "OTHER"]),
  name: z
    .string()
    .min(2, "O nome do familiar deve ter pelo menos 2 caracteres."),
  dateOfBirth: z.coerce.date(),
});

export const createClientSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres."),
  email: z.email("Formato de e-mail inválido."),
  dateOfBirth: z.coerce.date(),
  familyProfile: z.array(familyMemberSchema).optional(),
  isActive: z.boolean().default(true),
});

export const updateClientSchema = createClientSchema.partial();

export const clientIdParamsSchema = z.object({
  id: z.uuid(),
});

export const clientResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  dateOfBirth: z.date(),
  isActive: z.boolean(),
  familyProfile: z.json().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const paginatedClientsResponseSchema = createPaginatedResponseSchema(
  clientResponseSchema
).extend({
  clients: z.array(clientResponseSchema),
  items: z.undefined(),
});
