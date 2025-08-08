import { z } from "zod";

export const createSessionSchema = z.object({
  email: z.email("Formato de e-mail inválido."),
  password: z.string(),
});

export const sessionResponseSchema = z.object({
  token: z.string(),
});
