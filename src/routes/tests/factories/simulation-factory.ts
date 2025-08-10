import { prisma } from "../../../lib/prisma";
import { createTestClient } from "./client-factory";

interface CreateSimulationOptions {
  clientId?: string;
  rate?: number;
}

export const TEST_PROJECTION = [
  {
    year: 10000,
    projectedValue: "PROJEÇÃO DE TESTE",
  },
];

export async function createTestSimulation({
  clientId,
  rate = 4,
}: CreateSimulationOptions = {}) {
  let finalClientId = clientId;

  if (!finalClientId) {
    const client = await createTestClient();
    finalClientId = client.id;
  }

  const simulationData = {
    projection: TEST_PROJECTION,
    clientId: finalClientId,
    rate,
    endYear: 2060,
  };

  const simulation = await prisma.simulation.create({
    data: simulationData,
  });

  return simulation;
}
