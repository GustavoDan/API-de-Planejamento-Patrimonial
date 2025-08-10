import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { clientIdParamsSchema } from "../schemas/client.schema";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const jwtPayloadSchema = z.object({
  sub: z.uuid(),
  role: z.enum(["ADVISOR", "VIEWER"]),
  clientId: z.uuid().optional(),
  iat: z.number(),
  exp: z.number(),
});

export type AuthenticatedUser = z.infer<typeof jwtPayloadSchema>;

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    await request.jwtVerify();
  } catch {
    reply
      .status(401)
      .send({ message: "Invalid or expired authentication token." });
  }
}

export async function ensureAdvisor(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { role } = request.user;

  if (role !== "ADVISOR") {
    return reply.status(403).send({
      message: "Acesso negado. Esta rota é restrita a administradores.",
    });
  }
}

export async function ensureOwnerOrAdvisor(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const { role, clientId: userClientId } = request.user;

  if (role === "ADVISOR") {
    return;
  }

  const { clientId: targetClientId } = clientIdParamsSchema.parse(
    request.params
  );

  if (role === "VIEWER" && userClientId === targetClientId) {
    return;
  }

  return reply.status(403).send({
    message: "Acesso negado. Você não tem permissão para acessar este recurso.",
  });
}
