import { z } from "zod";
import { createPaginatedResponseSchema } from "./shared.schema";

export const createEventSchema = z.object({
  description: z
    .string()
    .min(3, "A descrição deve ter pelo menos 3 caracteres."),
  category: z.enum(["INCOME", "EXPENSE"]),
  value: z.number().positive("O valor deve ser positivo."),
  frequency: z.enum(["UNIQUE", "MONTHLY", "ANNUAL"]),
});

export const updateEventSchema = createEventSchema.partial();

export const eventIdParamsSchema = z.object({
  eventId: z.uuid(),
});

export const eventResponseSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  category: z.enum(["INCOME", "EXPENSE"]),
  value: z.string(),
  frequency: z.enum(["UNIQUE", "MONTHLY", "ANNUAL"]),
  clientId: z.uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const paginatedEventsResponseSchema = createPaginatedResponseSchema(
  eventResponseSchema
).extend({
  events: z.array(eventResponseSchema),
  items: z.undefined(),
});
