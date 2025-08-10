import { z } from "zod";

export const createProjectionSchema = z.object({
  annualRate: z
    .number()
    .min(0, "A taxa anual não pode ser negativa.")
    .default(4),
});

const projectionPointSchema = z.object({
  year: z.number().int(),
  projectedValue: z.string(),
});

export const projectionResponseSchema = z.array(projectionPointSchema);
