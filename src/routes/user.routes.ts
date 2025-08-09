import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import {
  createUserSchema,
  paginatedUsersResponseSchema,
  updateUserSchema,
  userIdParamsSchema,
  userResponseSchema,
} from "../schemas/user.schema";
import bcrypt from "bcryptjs";
import { BCRYPT_SALT_ROUNDS } from "../config/constants";
import {
  returnMessageSchema,
  paginationQuerySchema,
} from "../schemas/shared.schema";
import { paginate } from "../utils/pagination";
import { Prisma, User } from "@prisma/client";
import { z } from "zod";

const userPublicSelect = {
  id: true,
  email: true,
  role: true,
  clientId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function userRoutes(app: FastifyInstance) {
  app.get(
    "/users",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Lista todos os usuários do sistema.",
        tags: ["Users"],
        querystring: paginationQuerySchema,
        response: {
          200: paginatedUsersResponseSchema,
          403: returnMessageSchema,
          401: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { page, pageSize } = paginationQuerySchema.parse(request.query);

      const result = await paginate<
        Prisma.UserDelegate,
        Prisma.UserFindManyArgs,
        User
      >(
        prisma.user,
        {
          select: userPublicSelect,
          orderBy: { createdAt: "desc" },
        },
        { page, pageSize }
      );

      return reply.status(200).send({
        users: result.items,
        meta: result.meta,
      });
    }
  );

  app.get(
    "/users/:userId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Obtém os detalhes de um usuário específico por seu ID.",
        tags: ["Users"],
        params: userIdParamsSchema,
        response: {
          200: userResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { userId: id } = userIdParamsSchema.parse(request.params);

      const user = await prisma.user.findUnique({
        where: {
          id,
        },
        select: userPublicSelect,
      });

      if (!user) {
        return reply.status(404).send({ message: "Usuário não encontrado." });
      }

      return reply.status(200).send(user);
    }
  );

  app.get(
    "/me",
    {
      onRequest: [app.authenticate],
      schema: {
        description: "Obtém os detalhes do usuário atualmente autenticado.",
        tags: ["Users", "Sessions"],
        response: {
          200: userResponseSchema,
          401: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const userId = request.user.sub;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: userPublicSelect,
      });

      if (!user) {
        return reply.status(404).send({ message: "Usuário não encontrado." });
      }

      return reply.status(200).send(user);
    }
  );

  app.post(
    "/users",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Cria um novo usuário (ADVISOR ou VIEWER).",
        tags: ["Users"],
        body: createUserSchema,
        response: {
          201: userResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          409: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { email, password, role, clientId } = createUserSchema.parse(
        request.body
      );

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return reply
          .status(409)
          .send({ message: "Este e-mail já está em uso." });
      }

      const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          role,
          clientId,
        },
      });

      const { password: _, ...userWithoutPassword } = user;
      return reply.status(201).send(userWithoutPassword);
    }
  );

  app.put(
    "/users/:userId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Atualiza os dados de um usuário específico.",
        tags: ["Users"],
        params: userIdParamsSchema,
        body: updateUserSchema,
        response: {
          200: userResponseSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { userId: id } = userIdParamsSchema.parse(request.params);
      let { email, password, role } = updateUserSchema.parse(request.body);

      if (password) {
        password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
      }

      try {
        const updatedUser = await prisma.user.update({
          where: { id },
          data: { email, password, role },
        });

        const { password: _, ...userWithoutPassword } = updatedUser;
        return reply.status(200).send(userWithoutPassword);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.status(404).send({ message: "Usuário não encontrado." });
        }
        throw error;
      }
    }
  );

  app.delete(
    "/users/:userId",
    {
      onRequest: [app.authenticate, app.ensureAdvisor],
      schema: {
        description: "Deleta um usuário específico.",
        tags: ["Users"],
        params: userIdParamsSchema,
        response: {
          204: z.object(),
          400: returnMessageSchema,
          401: returnMessageSchema,
          403: returnMessageSchema,
          404: returnMessageSchema,
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { userId: id } = userIdParamsSchema.parse(request.params);

      if (request.user.sub === id) {
        return reply
          .status(400)
          .send({ message: "Não é permitido se auto-deletar." });
      }

      try {
        await prisma.user.delete({
          where: { id },
        });
        return reply.status(204).send();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          return reply.status(404).send({ message: "Usuário não encontrado." });
        }
        throw error;
      }
    }
  );
}
