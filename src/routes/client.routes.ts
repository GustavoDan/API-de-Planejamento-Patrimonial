import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import {
  createClientSchema,
  updateClientSchema,
  clientIdParamsSchema,
  clientResponseSchema,
  paginatedClientsResponseSchema,
  clientStatsResponseSchema,
} from "../schemas/client.schema";
import {
  returnMessageSchema,
  paginationQuerySchema,
} from "../schemas/shared.schema";
import { paginate } from "../utils/pagination";
import { Client, Prisma } from "@prisma/client";
import { z } from "zod";
import { getClientPlanningStats } from "../services/client.service";

const clientPublicSelect = {
  id: true,
  name: true,
  email: true,
  dateOfBirth: true,
  isActive: true,
  familyProfile: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function clientRoutes(app: FastifyInstance) {
  app.get(
    "/clients",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Lista todos os clientes com paginação.",
        tags: ["Clients"],
        querystring: paginationQuerySchema,
        response: {
          200: paginatedClientsResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { page, pageSize } = paginationQuerySchema.parse(request.query);

      const result = await paginate<
        Prisma.ClientDelegate,
        Prisma.ClientFindManyArgs,
        Client
      >(
        prisma.client,
        {
          select: clientPublicSelect,
          orderBy: { createdAt: "desc" },
        },
        { page, pageSize }
      );

      return reply.status(200).send({
        clients: result.items,
        meta: result.meta,
      });
    }
  );

  app.get(
    "/clients/:clientId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Obtém os detalhes de um cliente específico.",
        tags: ["Clients"],
        params: clientIdParamsSchema,
        response: {
          200: clientResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId: id } = clientIdParamsSchema.parse(request.params);

      const client = await prisma.client.findUnique({
        where: { id },
        select: clientPublicSelect,
      });

      if (!client) {
        return reply.status(404).send({ message: "Cliente não encontrado." });
      }

      return reply.status(200).send(client);
    }
  );

  app.post(
    "/clients",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Cria um novo cliente.",
        tags: ["Clients"],
        body: createClientSchema,
        response: {
          201: clientResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          409: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const data = createClientSchema.parse(request.body);

      const existingClient = await prisma.client.findUnique({
        where: { email: data.email },
      });
      if (existingClient) {
        return reply
          .status(409)
          .send({ message: "Um cliente com este e-mail já existe." });
      }

      const client = await prisma.client.create({ data });

      return reply.status(201).send(client);
    }
  );

  app.put(
    "/clients/:clientId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Atualiza os dados de um cliente específico.",
        tags: ["Clients"],
        params: clientIdParamsSchema,
        body: updateClientSchema,
        response: {
          200: clientResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
          409: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId: id } = clientIdParamsSchema.parse(request.params);
      const data = updateClientSchema.parse(request.body);

      try {
        const updatedClient = await prisma.client.update({
          where: { id },
          data,
          select: clientPublicSelect,
        });
        return reply.status(200).send(updatedClient);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2025") {
            return reply
              .status(404)
              .send({ message: "Usuário não encontrado." });
          }
          if (error.code === "P2002") {
            return reply.status(409).send({
              message: "O e-mail fornecido já está em uso por outro usuário.",
            });
          }

          throw error;
        }
      }
    }
  );

  app.delete(
    "/clients/:clientId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Deleta um cliente específico.",
        tags: ["Clients"],
        params: clientIdParamsSchema,
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
      const { clientId: id } = clientIdParamsSchema.parse(request.params);

      try {
        await prisma.client.delete({ where: { id } });
        return reply.status(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.status(404).send({ message: "Cliente não encontrado." });
        }
        throw error;
      }
    }
  );

  app.get(
    "/clients/stats",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description:
          "Obtém estatísticas sobre os clientes, como a porcentagem com planejamento.",
        tags: ["Clients"],
        response: {
          200: clientStatsResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (_, reply) => {
      const stats = await getClientPlanningStats();
      return reply.status(200).send(stats);
    }
  );
}
