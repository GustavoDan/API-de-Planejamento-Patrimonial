import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import {
  createSessionSchema,
  sessionResponseSchema,
} from "../schemas/session.schema";
import bcrypt from "bcryptjs";
import { returnMessageSchema } from "../schemas/shared.schema";

export async function sessionRoutes(app: FastifyInstance) {
  app.post(
    "/sessions",
    {
      schema: {
        description: "Autentica um usuário e retorna um token JWT.",
        tags: ["Sessions"],
        body: createSessionSchema,
        response: { 200: sessionResponseSchema, 401: returnMessageSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = createSessionSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return reply.status(401).send({ message: "Credenciais inválidas." });
      }

      const isPasswordCorrect = await bcrypt.compare(password, user.password);

      if (!isPasswordCorrect) {
        return reply.status(401).send({ message: "Credenciais inválidas." });
      }

      const token = await reply.jwtSign(
        {
          role: user.role,
          clientId: user.clientId,
        },
        {
          sign: {
            sub: user.id,
            expiresIn: "7d",
          },
        }
      );

      return reply.send({ token });
    }
  );
}
