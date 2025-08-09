import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import {
  createInsuranceSchema,
  updateInsuranceSchema,
  insuranceIdParamsSchema,
  insuranceResponseSchema,
  paginatedInsurancesResponseSchema,
} from "../schemas/insurance.schema";
import {
  returnMessageSchema,
  paginationQuerySchema,
} from "../schemas/shared.schema";
import { clientIdParamsSchema } from "../schemas/client.schema";
import { paginate } from "../utils/pagination";
import { Insurance, Prisma } from "@prisma/client";
import { z } from "zod";

const insurancePublicSelect = {
  id: true,
  type: true,
  coverageValue: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function insuranceRoutes(app: FastifyInstance) {
  app.get(
    "/clients/:clientId/insurances",
    {
      onRequest: [app.authenticate, app.ensureOwnerOrAdvisor],
      schema: {
        description:
          "Lista todos os seguros de um cliente específico com paginação.",
        tags: ["Insurances"],
        params: clientIdParamsSchema,
        querystring: paginationQuerySchema,
        response: {
          200: paginatedInsurancesResponseSchema,
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
        Prisma.InsuranceDelegate,
        Prisma.InsuranceFindManyArgs,
        Insurance
      >(
        prisma.insurance,
        {
          where: { clientId },
          select: insurancePublicSelect,
          orderBy: { createdAt: "desc" },
        },
        { page, pageSize }
      );

      const insurances = result.items.map((insurance) => ({
        ...insurance,
        coverageValue: insurance.coverageValue.toString(),
      }));

      return reply.status(200).send({
        insurances,
        meta: result.meta,
      });
    }
  );

  app.get(
    "/insurances/:insuranceId",
    {
      onRequest: [app.authenticate],
      schema: {
        description: "Obtém os detalhes de um seguro específico.",
        tags: ["Insurances"],
        params: insuranceIdParamsSchema,
        response: {
          200: insuranceResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { insuranceId } = insuranceIdParamsSchema.parse(request.params);
      const user = request.user;

      const insurance = await prisma.insurance.findUnique({
        where: { id: insuranceId },
        select: insurancePublicSelect,
      });

      if (!insurance) {
        return reply.status(404).send({ message: "Seguro não encontrado." });
      }

      if (user.role !== "ADVISOR" && user.clientId !== insurance.clientId) {
        return reply.status(403).send({ message: "Acesso negado." });
      }

      return reply.status(200).send({
        ...insurance,
        coverageValue: insurance.coverageValue.toString(),
      });
    }
  );

  app.post(
    "/clients/:clientId/insurances",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Cria um novo seguro para um cliente específico.",
        tags: ["Insurances"],
        params: clientIdParamsSchema,
        body: createInsuranceSchema,
        response: {
          201: insuranceResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { clientId } = clientIdParamsSchema.parse(request.params);
      const data = createInsuranceSchema.parse(request.body);

      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });
      if (!client) {
        return reply.status(404).send({ message: "Cliente não encontrado." });
      }

      const insurance = await prisma.insurance.create({
        data: { ...data, clientId },
        select: insurancePublicSelect,
      });

      return reply.status(201).send({
        ...insurance,
        coverageValue: insurance.coverageValue.toString(),
      });
    }
  );

  app.put(
    "/insurances/:insuranceId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Atualiza os dados de um seguro específico.",
        tags: ["Insurances"],
        params: insuranceIdParamsSchema,
        body: updateInsuranceSchema,
        response: {
          200: insuranceResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { insuranceId } = insuranceIdParamsSchema.parse(request.params);
      const data = updateInsuranceSchema.parse(request.body);

      try {
        const updatedInsurance = await prisma.insurance.update({
          where: { id: insuranceId },
          data,
          select: insurancePublicSelect,
        });

        return reply.status(200).send({
          ...updatedInsurance,
          coverageValue: updatedInsurance.coverageValue.toString(),
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.status(404).send({ message: "Seguro não encontrado." });
        }
        throw error;
      }
    }
  );

  app.delete(
    "/insurances/:insuranceId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Deleta um seguro específico.",
        tags: ["Insurances"],
        params: insuranceIdParamsSchema,
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
      const { insuranceId } = insuranceIdParamsSchema.parse(request.params);

      try {
        await prisma.insurance.delete({ where: { id: insuranceId } });
        return reply.status(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.status(404).send({ message: "Seguro não encontrado." });
        }
        throw error;
      }
    }
  );
}
