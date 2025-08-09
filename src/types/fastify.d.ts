import { AuthenticatedUser } from "../hooks/auth";

declare module "fastify" {
  export interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    ensureAdvisor: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    ensureOwnerOrAdvisor: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: AuthenticatedUser;
  }
}
