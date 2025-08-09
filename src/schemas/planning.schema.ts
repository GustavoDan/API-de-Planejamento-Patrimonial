import { z } from "zod";

export const alignmentCategorySchema = z.enum([
  "green",
  "yellow-light",
  "yellow-dark",
  "red",
]);

export const alignmentResponseSchema = z.object({
  alignmentPercentage: z.string(),
  category: alignmentCategorySchema,
});
