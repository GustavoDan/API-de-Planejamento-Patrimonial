import { prisma } from "../../../lib/prisma";
import { createTestClient } from "./client-factory";

interface CreateInsuranceOptions {
  clientId?: string;
  type?: "LIFE" | "DISABILITY";
}

export const TEST_COVERAGE_VALUE = 999999999999999104.52;

export async function createTestInsurance(
  options: CreateInsuranceOptions = {}
) {
  const { clientId, type = "LIFE" } = options;

  let finalClientId = clientId;

  if (!finalClientId) {
    const client = await createTestClient();
    finalClientId = client.id;
  }

  const insuranceData = {
    type,
    coverageValue: TEST_COVERAGE_VALUE,
    clientId: finalClientId,
  };

  const insurance = await prisma.insurance.create({
    data: insuranceData,
  });

  return insurance;
}
