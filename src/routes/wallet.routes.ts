import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import {
  upsertWalletSchema,
  walletResponseSchema,
} from "../schemas/wallet.schema";
import { returnMessageSchema } from "../schemas/shared.schema";
import { clientIdParamsSchema } from "../schemas/client.schema";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const walletPublicSelect = {
  id: true,
  totalValue: true,
  assetClasses: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function walletRoutes(app: FastifyInstance) {
  app.get(
    "/clients/:clientId/wallet",
    {
      onRequest: [app.authenticate, app.ensureOwnerOrAdvisor],
      schema: {
        description:
          "Obtém a carteira (patrimônio e alocação) de um cliente específico.",
        tags: ["Wallets"],
        params: clientIdParamsSchema,
        response: {
          200: walletResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);

      const wallet = await prisma.wallet.findUnique({
        where: { clientId },
        select: walletPublicSelect,
      });

      if (!wallet) {
        return reply.status(404).send({
          message:
            "Carteira não encontrada para este cliente. Por favor, crie uma primeiro.",
        });
      }

      return reply.status(200).send({
        ...wallet,
        totalValue: wallet.totalValue.toString(),
      });
    }
  );

  app.put(
    "/clients/:clientId/wallet",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Cria ou atualiza a carteira de um cliente específico.",
        tags: ["Wallets"],
        params: clientIdParamsSchema,
        body: upsertWalletSchema,
        response: {
          200: walletResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);
      const data = upsertWalletSchema.parse(request.body);

      try {
        const wallet = await prisma.wallet.upsert({
          where: { clientId },
          update: data,
          create: {
            ...data,
            clientId,
          },
          select: walletPublicSelect,
        });

        return reply.status(200).send({
          ...wallet,
          totalValue: wallet.totalValue.toString(),
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2003"
        ) {
          return reply
            .status(404)
            .send({ message: `Cliente com ID '${clientId}' não encontrado.` });
        }
        throw error;
      }
    }
  );

  app.delete(
    "/clients/:clientId/wallet",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Deleta a carteira de um cliente específico.",
        tags: ["Wallets"],
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
      const { clientId } = clientIdParamsSchema.parse(request.params);

      try {
        await prisma.wallet.delete({ where: { clientId } });
        return reply.status(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply
            .status(404)
            .send({ message: "Carteira não encontrada para este cliente." });
        }
        throw error;
      }
    }
  );
}
