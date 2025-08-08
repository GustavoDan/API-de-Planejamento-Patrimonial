import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import { fastifySwagger } from "@fastify/swagger";
import { fastifySwaggerUi } from "@fastify/swagger-ui";
import { fastifyJwt } from "@fastify/jwt";
import { config } from "dotenv";
import { resolve } from "path";
import { userRoutes } from "./routes/user.routes";
import { sessionRoutes } from "./routes/session.routes";
import { authenticate, ensureAdvisor } from "./hooks/auth";
import { clientRoutes } from "./routes/client.routes";

config({ path: resolve(__dirname, "..", ".env") });

export const app = fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();
if (!process.env.JWT_SECRET) {
  throw new Error("Please set JWT_SECRET in your environment variables.");
}

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(fastifyCors, { origin: "*" });
app.register(fastifyJwt, { secret: process.env.JWT_SECRET });

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "API de Planejamento Patrimonial",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },

  transform: jsonSchemaTransform,
});

app.register(fastifySwaggerUi, { routePrefix: "/docs" });
app.register(userRoutes);
app.register(sessionRoutes);
app.register(clientRoutes);

app.decorate("authenticate", authenticate);
app.decorate("ensureAdvisor", ensureAdvisor);

app.listen({ port: 3000 });
