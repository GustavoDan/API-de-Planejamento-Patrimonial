import { FastifyInstance } from "fastify";
import { clientIdParamsSchema } from "../schemas/client.schema";
import {
  createProjectionSchema,
  createSimulationSchema,
  paginatedSimulationsResponseSchema,
  projectionResponseSchema,
  simulationIdParamsSchema,
  simulationResponseSchema,
} from "../schemas/simulation.schema";
import {
  paginationQuerySchema,
  returnMessageSchema,
} from "../schemas/shared.schema";
import {
  ProjectionError,
  generateProjectionForClient,
} from "../services/projection.service";
import { Prisma, Simulation } from "@prisma/client";
import { paginate } from "../utils/pagination";
import { prisma } from "../lib/prisma";
import z from "zod";

const simulationPublicSelect = {
  id: true,
  savedAt: true,
  projection: true,
  rate: true,
  endYear: true,
  clientId: true,
} as const;

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

  app.get(
    "/clients/:clientId/simulations",
    {
      onRequest: [app.authenticate, app.ensureOwnerOrAdvisor],
      schema: {
        description: "Lista o histórico de simulações salvas de um cliente.",
        tags: ["Simulations & Projections"],
        params: clientIdParamsSchema,
        querystring: paginationQuerySchema,
        response: {
          200: paginatedSimulationsResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);
      const { page, pageSize } = paginationQuerySchema.parse(request.query);

      const result = await paginate<
        Prisma.SimulationDelegate,
        Prisma.SimulationFindManyArgs,
        Simulation
      >(
        prisma.simulation,
        {
          where: { clientId },
          select: simulationPublicSelect,
          orderBy: { savedAt: "desc" },
        },
        { page, pageSize }
      );

      const simulations = result.items.map((simulation) => ({
        ...simulation,
        rate: simulation.rate.toString(),
      }));

      return reply.status(200).send({
        simulations,
        meta: result.meta,
      });
    }
  );

  app.get(
    "/simulations/:simulationId",
    {
      onRequest: [app.authenticate],
      schema: {
        description: "Obtém os dados de uma simulação salva específica.",
        tags: ["Simulations & Projections"],
        params: simulationIdParamsSchema,
        response: {
          200: simulationResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { simulationId } = simulationIdParamsSchema.parse(request.params);
      const user = request.user;

      const simulation = await prisma.simulation.findUnique({
        where: { id: simulationId },
        select: simulationPublicSelect,
      });

      if (!simulation) {
        return reply.status(404).send({ message: "Simulação não encontrada." });
      }

      if (user.role !== "ADVISOR" && user.clientId !== simulation.clientId) {
        return reply.status(403).send({ message: "Acesso negado." });
      }

      return reply
        .status(200)
        .send({ ...simulation, rate: simulation.rate.toString() });
    }
  );

  app.post(
    "/clients/:clientId/simulations",
    {
      onRequest: [app.authenticate, app.ensureOwnerOrAdvisor],
      schema: {
        description:
          "Salva o resultado de uma projeção no histórico de um cliente.",
        tags: ["Simulations & Projections"],
        params: clientIdParamsSchema,
        body: createSimulationSchema,
        response: {
          201: simulationResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);
      const { projectionData, rate } = createSimulationSchema.parse(
        request.body
      );

      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });
      if (!client) {
        return reply.status(404).send({ message: "Cliente não encontrado." });
      }

      const simulation = await prisma.simulation.create({
        data: {
          clientId,
          projection: projectionData,
          rate,
          endYear: 2060,
        },
        select: simulationPublicSelect,
      });

      return reply
        .status(201)
        .send({ ...simulation, rate: simulation.rate.toString() });
    }
  );

  app.delete(
    "/simulations/:simulationId",
    {
      onRequest: [app.authenticate],
      schema: {
        description: "Deleta uma simulação do histórico.",
        tags: ["Simulations & Projections"],
        params: simulationIdParamsSchema,
        response: {
          204: z.null(),
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { simulationId } = simulationIdParamsSchema.parse(request.params);
      const user = request.user;

      const simulation = await prisma.simulation.findUnique({
        where: { id: simulationId },
        select: { clientId: true },
      });

      if (!simulation) {
        return reply.status(404).send({ message: "Simulação não encontrada." });
      }

      if (user.role !== "ADVISOR" && user.clientId !== simulation.clientId) {
        return reply.status(403).send({
          message:
            "Acesso negado. Você não tem permissão para deletar esta simulação.",
        });
      }

      await prisma.simulation.delete({
        where: { id: simulationId },
      });

      return reply.status(204).send();
    }
  );
}
