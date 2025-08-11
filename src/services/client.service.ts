import { prisma } from "../lib/prisma";

export async function getClientPlanningStats() {
  const totalClients = await prisma.client.count();

  if (totalClients === 0) {
    return {
      totalClients: 0,
      clientsWithPlan: 0,
      percentageWithPlan: 0,
    };
  }

  const clientsWithPlan = await prisma.client.count({
    where: {
      AND: [{ wallet: { isNot: null } }, { goals: { some: {} } }],
    },
  });

  const percentageWithPlan = parseFloat(
    ((clientsWithPlan / totalClients) * 100).toFixed(2)
  );

  return {
    totalClients,
    clientsWithPlan,
    percentageWithPlan,
  };
}
