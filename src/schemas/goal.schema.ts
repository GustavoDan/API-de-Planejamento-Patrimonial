import { z } from "zod";
import { createPaginatedResponseSchema } from "./shared.schema";
import { clientIdParamsSchema } from "./client.schema";

export const createGoalSchema = z.object({
  description: z
    .string()
    .min(3, "A descrição deve ter pelo menos 3 caracteres."),
  targetValue: z.number().positive("O valor alvo deve ser positivo."),
  targetDate: z.coerce.date(),
});

export const updateGoalSchema = createGoalSchema.partial();

export const goalIdParamsSchema = z.object({
  goalId: z.uuid(),
});

export const goalResponseSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  targetValue: z.string(),
  targetDate: z.date(),
  clientId: z.uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const paginatedGoalsResponseSchema = createPaginatedResponseSchema(
  goalResponseSchema
).extend({
  goals: z.array(goalResponseSchema),
  items: z.undefined(),
});

export const clientAndGoalIdParamsSchema =
  clientIdParamsSchema.and(goalIdParamsSchema);
