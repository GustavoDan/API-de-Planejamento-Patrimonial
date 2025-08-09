import { z } from "zod";
import { createPaginatedResponseSchema } from "./shared.schema";

export const createInsuranceSchema = z.object({
  type: z.enum(["LIFE", "DISABILITY"]),
  coverageValue: z.number().positive("O valor da cobertura deve ser positivo."),
});

export const updateInsuranceSchema = createInsuranceSchema.partial();

export const insuranceIdParamsSchema = z.object({
  insuranceId: z.uuid(),
});

export const insuranceResponseSchema = z.object({
  id: z.uuid(),
  type: z.enum(["LIFE", "DISABILITY"]),
  coverageValue: z.string(),
  clientId: z.uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const paginatedInsurancesResponseSchema = createPaginatedResponseSchema(
  insuranceResponseSchema
).extend({
  insurances: z.array(insuranceResponseSchema),
  items: z.undefined(),
});
