import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import {
  createEventSchema,
  updateEventSchema,
  eventIdParamsSchema,
  eventResponseSchema,
  paginatedEventsResponseSchema,
} from "../schemas/event.schema";
import {
  returnMessageSchema,
  paginationQuerySchema,
} from "../schemas/shared.schema";
import { clientIdParamsSchema } from "../schemas/client.schema";
import { paginate } from "../utils/pagination";
import { Prisma, Event as PrismaEvent } from "@prisma/client";
import { z } from "zod";

const eventPublicSelect = {
  id: true,
  description: true,
  category: true,
  value: true,
  frequency: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function eventRoutes(app: FastifyInstance) {
  app.get(
    "/clients/:clientId/events",
    {
      onRequest: [app.authenticate, app.ensureOwnerOrAdvisor],
      schema: {
        description:
          "Lista todas as movimentações de um cliente específico com paginação.",
        tags: ["Events"],
        params: clientIdParamsSchema,
        querystring: paginationQuerySchema,
        response: {
          200: paginatedEventsResponseSchema,
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
        Prisma.EventDelegate,
        Prisma.EventFindManyArgs,
        PrismaEvent
      >(
        prisma.event,
        {
          where: { clientId },
          select: eventPublicSelect,
          orderBy: { createdAt: "desc" },
        },
        { page, pageSize }
      );

      const events = result.items.map((event) => ({
        ...event,
        value: event.value.toString(),
      }));

      return reply.status(200).send({
        events,
        meta: result.meta,
      });
    }
  );

  app.get(
    "/events/:eventId",
    {
      onRequest: [app.authenticate],
      schema: {
        description: "Obtém os detalhes de uma movimentação específica.",
        tags: ["Events"],
        params: eventIdParamsSchema,
        response: {
          200: eventResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { eventId } = eventIdParamsSchema.parse(request.params);
      const user = request.user;

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: eventPublicSelect,
      });

      if (!event) {
        return reply
          .status(404)
          .send({ message: "Movimentação não encontrada." });
      }

      if (user.role !== "ADVISOR" && user.clientId !== event.clientId) {
        return reply.status(403).send({ message: "Acesso negado." });
      }

      return reply.status(200).send({
        ...event,
        value: event.value.toString(),
      });
    }
  );

  app.post(
    "/clients/:clientId/events",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description:
          "Cria uma nova movimentação (evento) para um cliente específico.",
        tags: ["Events"],
        params: clientIdParamsSchema,
        body: createEventSchema,
        response: {
          201: eventResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);
      const data = createEventSchema.parse(request.body);

      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });
      if (!client) {
        return reply.status(404).send({ message: "Cliente não encontrado." });
      }

      const event = await prisma.event.create({
        data: { ...data, clientId },
        select: eventPublicSelect,
      });

      return reply.status(201).send({
        ...event,
        value: event.value.toString(),
      });
    }
  );

  app.put(
    "/events/:eventId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Atualiza os dados de uma movimentação específica.",
        tags: ["Events"],
        params: eventIdParamsSchema,
        body: updateEventSchema,
        response: {
          200: eventResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { eventId } = eventIdParamsSchema.parse(request.params);
      const data = updateEventSchema.parse(request.body);

      try {
        const updatedEvent = await prisma.event.update({
          where: { id: eventId },
          data,
          select: eventPublicSelect,
        });

        return reply.status(200).send({
          ...updatedEvent,
          value: updatedEvent.value.toString(),
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply
            .status(404)
            .send({ message: "Movimentação não encontrada." });
        }
        throw error;
      }
    }
  );

  app.delete(
    "/events/:eventId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Deleta uma movimentação específica.",
        tags: ["Events"],
        params: eventIdParamsSchema,
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
      const { eventId } = eventIdParamsSchema.parse(request.params);

      try {
        await prisma.event.delete({ where: { id: eventId } });
        return reply.status(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply
            .status(404)
            .send({ message: "Movimentação não encontrada." });
        }
        throw error;
      }
    }
  );
}
