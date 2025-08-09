import { z } from "zod";
import { assetClassSchema } from "./shared.schema";

export const upsertWalletSchema = z.object({
  totalValue: z
    .number()
    .positive("O patrimônio total deve ser um valor positivo."),
  assetClasses: z.array(assetClassSchema).optional(),
});

export const walletResponseSchema = z.object({
  id: z.uuid(),
  totalValue: z.string(),
  assetClasses: z.json().nullable(),
  clientId: z.uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
