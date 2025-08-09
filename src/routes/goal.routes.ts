import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import {
  createGoalSchema,
  updateGoalSchema,
  goalIdParamsSchema,
  goalResponseSchema,
  paginatedGoalsResponseSchema,
} from "../schemas/goal.schema";
import {
  returnMessageSchema,
  paginationQuerySchema,
} from "../schemas/shared.schema";
import { clientIdParamsSchema } from "../schemas/client.schema";
import { paginate } from "../utils/pagination";
import { Goal, Prisma } from "@prisma/client";
import { z } from "zod";

const goalPublicSelect = {
  id: true,
  description: true,
  targetValue: true,
  targetDate: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function goalRoutes(app: FastifyInstance) {
  app.get(
    "/clients/:clientId/goals",
    {
      onRequest: [app.authenticate, app.ensureOwnerOrAdvisor],
      schema: {
        description:
          "Lista todas as metas de um cliente específico com paginação.",
        tags: ["Goals"],
        params: clientIdParamsSchema,
        querystring: paginationQuerySchema,
        response: {
          200: paginatedGoalsResponseSchema,
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
        Prisma.GoalDelegate,
        Prisma.GoalFindManyArgs,
        Goal
      >(
        prisma.goal,
        {
          where: { clientId },
          select: goalPublicSelect,
          orderBy: { targetDate: "desc" },
        },
        { page, pageSize }
      );

      const goals = result.items.map((goal) => ({
        ...goal,
        targetValue: goal.targetValue.toString(),
      }));

      return reply.status(200).send({
        goals,
        meta: result.meta,
      });
    }
  );

  app.get(
    "/goals/:goalId",
    {
      onRequest: [app.authenticate],
      schema: {
        description: "Obtém os detalhes de uma meta específica.",
        tags: ["Goals"],
        params: goalIdParamsSchema,
        response: {
          200: goalResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { goalId } = goalIdParamsSchema.parse(request.params);
      const user = request.user;

      const goal = await prisma.goal.findUnique({
        where: { id: goalId },
        select: goalPublicSelect,
      });

      if (!goal) {
        return reply.status(404).send({ message: "Meta não encontrada." });
      }

      if (user.role !== "ADVISOR" && user.clientId !== goal.clientId) {
        return reply.status(403).send({ message: "Acesso negado." });
      }

      return reply
        .status(200)
        .send({ ...goal, targetValue: goal.targetValue.toString() });
    }
  );

  app.post(
    "/clients/:clientId/goals",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Cria uma nova meta para um cliente específico.",
        tags: ["Goals"],
        params: clientIdParamsSchema,
        body: createGoalSchema,
        response: {
          201: goalResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);
      const data = createGoalSchema.parse(request.body);

      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });

      if (!client) {
        return reply.status(404).send({ message: "Cliente não encontrado." });
      }

      const goal = await prisma.goal.create({
        data: {
          ...data,
          clientId,
        },
        select: goalPublicSelect,
      });

      return reply
        .status(201)
        .send({ ...goal, targetValue: goal.targetValue.toString() });
    }
  );

  app.put(
    "/goals/:goalId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Atualiza os dados de uma meta específica.",
        tags: ["Goals"],
        params: goalIdParamsSchema,
        body: updateGoalSchema,
        response: {
          200: goalResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { goalId: id } = goalIdParamsSchema.parse(request.params);
      const data = updateGoalSchema.parse(request.body);

      try {
        const updatedGoal = await prisma.goal.update({
          where: { id },
          data,
          select: goalPublicSelect,
        });
        return reply
          .status(200)
          .send({
            ...updatedGoal,
            targetValue: updatedGoal.targetValue.toString(),
          });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.status(404).send({ message: "Meta não encontrada." });
        }
        throw error;
      }
    }
  );

  app.delete(
    "/goals/:goalId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Deleta uma meta específica.",
        tags: ["Goals"],
        params: goalIdParamsSchema,
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
      const { goalId: id } = goalIdParamsSchema.parse(request.params);

      try {
        await prisma.goal.delete({ where: { id } });
        return reply.status(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.status(404).send({ message: "Meta não encontrada." });
        }
        throw error;
      }
    }
  );
}
