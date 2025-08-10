import {z} from 'zod';
import {createPaginatedResponseSchema} from './shared.schema';

export const createProjectionSchema = z.object({
	annualRate: z
		.number()
		.min(0, 'A taxa anual não pode ser negativa.')
		.default(4),
});

const projectionPointSchema = z.object({
	year: z.number().int(),
	projectedValue: z.string(),
});

export const projectionResponseSchema = z.array(projectionPointSchema);

export const createSimulationSchema = z.object({
	projectionData: projectionResponseSchema,
	rate: z.number(),
});

export const simulationIdParamsSchema = z.object({
	simulationId: z.uuid(),
});

export const simulationResponseSchema = z.object({
	id: z.uuid(),
	savedAt: z.date(),
	projection: z.json(),
	rate: z.string(),
	endYear: z.number(),
	clientId: z.uuid(),
});

export const paginatedSimulationsResponseSchema = createPaginatedResponseSchema(simulationResponseSchema).extend({
	simulations: z.array(simulationResponseSchema),
	items: z.undefined(),
});
