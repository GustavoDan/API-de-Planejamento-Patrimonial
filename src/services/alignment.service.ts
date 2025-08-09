import { z } from "zod";
import { prisma } from "../lib/prisma";
import { alignmentCategorySchema } from "../schemas/planning.schema";
import { Decimal } from "@prisma/client/runtime/library";

export class AlignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AlignmentError";
  }
}

export async function calculateAlignment(clientId: string) {
  const [wallet, goals] = await prisma.$transaction([
    prisma.wallet.findUnique({ where: { clientId } }),
    prisma.goal.findMany({ where: { clientId } }),
  ]);

  if (!wallet) {
    throw new AlignmentError(
      "O cliente não possui uma carteira cadastrada para calcular o alinhamento."
    );
  }

  if (goals.length === 0) {
    throw new AlignmentError(
      "O cliente não possui metas cadastradas para calcular o alinhamento."
    );
  }

  const plannedPatrimony = goals.reduce(
    (sum, goal) => sum.plus(goal.targetValue),
    Decimal(0)
  );

  if (plannedPatrimony.equals(0)) {
    return { alignmentPercentage: "100", category: "green" };
  }

  const alignmentPercentage = wallet.totalValue
    .div(plannedPatrimony)
    .times(100);

  let category: z.infer<typeof alignmentCategorySchema>;
  if (alignmentPercentage.gt(90)) {
    category = "green";
  } else if (alignmentPercentage.gte(70)) {
    category = "yellow-light";
  } else if (alignmentPercentage.gte(50)) {
    category = "yellow-dark";
  } else {
    category = "red";
  }

  return {
    alignmentPercentage: alignmentPercentage.toString(),
    category,
  };
}
