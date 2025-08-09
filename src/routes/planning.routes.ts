import { FastifyInstance } from "fastify";
import { clientIdParamsSchema } from "../schemas/client.schema";
import { alignmentResponseSchema } from "../schemas/planning.schema";
import { returnMessageSchema } from "../schemas/shared.schema";
import {
  AlignmentError,
  calculateAlignment,
} from "../services/alignment.service";

export async function planningRoutes(app: FastifyInstance) {
  app.get(
    "/clients/:clientId/alignment",
    {
      onRequest: [app.authenticate, app.ensureOwnerOrAdvisor],
      schema: {
        description:
          "Calcula o percentual de alinhamento de um cliente ao seu plano financeiro.",
        tags: ["Planning & Alignment"],
        params: clientIdParamsSchema,
        response: {
          200: alignmentResponseSchema,
          400: returnMessageSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);

      try {
        const alignmentData = await calculateAlignment(clientId);

        return reply.status(200).send(alignmentData);
      } catch (error) {
        if (error instanceof AlignmentError) {
          return reply.status(400).send({ message: error.message });
        }

        throw error;
      }
    }
  );
}
