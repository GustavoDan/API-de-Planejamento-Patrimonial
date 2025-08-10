import { FastifyInstance } from "fastify";
import { clientIdParamsSchema } from "../schemas/client.schema";
import {
  createProjectionSchema,
  projectionResponseSchema,
} from "../schemas/simulation.schema";
import { returnMessageSchema } from "../schemas/shared.schema";
import {
  ProjectionError,
  generateProjectionForClient,
} from "../services/projection.service";

export async function simulationRoutes(app: FastifyInstance) {
  app.post(
    "/clients/:clientId/projections",
    {
      onRequest: [app.authenticate, app.ensureOwnerOrAdvisor],
      schema: {
        description:
          "Gera uma projeção de evolução patrimonial para um cliente.",
        tags: ["Simulations & Projections"],
        params: clientIdParamsSchema,
        body: createProjectionSchema,
        response: {
          200: projectionResponseSchema,
          400: returnMessageSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);
      const { annualRate } = createProjectionSchema.parse(request.body);

      try {
        const projectionData = await generateProjectionForClient(
          clientId,
          annualRate
        );

        const formattedResponse = projectionData.map((point) => ({
          year: point.year,
          projectedValue: point.projectedValue.toFixed(2),
        }));

        return reply.send(formattedResponse);
      } catch (error) {
        if (error instanceof ProjectionError) {
          return reply.status(400).send({ message: error.message });
        }
        throw error;
      }
    }
  );
}
