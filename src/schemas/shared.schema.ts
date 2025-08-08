import { z, ZodType } from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createPaginatedResponseSchema = <T extends ZodType>(
  itemSchema: T
) => {
  return z.object({
    items: z.array(itemSchema),
    meta: z.object({
      total: z.number().int(),
      page: z.number().int(),
      pageSize: z.number().int(),
      pageCount: z.number().int(),
    }),
  });
};

export const returnMessageSchema = z.object({
  message: z.string(),
});
