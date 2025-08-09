import { z } from "zod";
import { createPaginatedResponseSchema } from "./shared.schema";

const roleEnum = z.enum(["ADVISOR", "VIEWER"]);

export const createUserSchema = z
  .object({
    email: z.email("Formato de e-mail inválido."),
    password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres."),
    role: roleEnum,
    clientId: z.uuid().optional(),
  })
  .refine(
    (data) => {
      if (data.role === "VIEWER" && !data.clientId) {
        return false;
      }
      return true;
    },
    {
      message: "O campo clientId é obrigatório para usuários do tipo VIEWER.",
      path: ["clientId"],
    }
  );

export const userResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: roleEnum,
  createdAt: z.date(),
});

export const listUsersResponseSchema = z.array(userResponseSchema);

export const userIdParamsSchema = z.object({
  userId: z.uuid(),
});

export const updateUserSchema = z.object({
  email: z.email().optional(),
  password: z.string().min(8).optional(),
  role: roleEnum.optional(),
});

export const paginatedUsersResponseSchema = createPaginatedResponseSchema(
  userResponseSchema
).extend({
  users: listUsersResponseSchema,
  items: z.undefined(),
});
