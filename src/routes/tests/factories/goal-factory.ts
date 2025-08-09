import { prisma } from "../../../lib/prisma";
import { createTestClient } from "./client-factory";

interface CreateGoalOptions {
  clientId?: string;
  overrides?: {
    descriptionPrefix?: string;
    targetValue?: number;
    targetDate?: Date;
  };
}

export const TEST_GOAL_DESCRIPTION_SUFFIX = "META     TESTE123   4567   98";

export const getTestGoalDescription = (prefix?: string) => {
  return `${prefix}${TEST_GOAL_DESCRIPTION_SUFFIX}`;
};

export async function createTestGoal(options: CreateGoalOptions = {}) {
  const { clientId, overrides = {} } = options;
  const {
    descriptionPrefix,
    targetValue = 100000,
    targetDate = new Date("2040-01-01"),
  } = overrides;
  const description = getTestGoalDescription(descriptionPrefix);

  let finalClientId = clientId;

  if (!finalClientId) {
    const client = await createTestClient();
    finalClientId = client.id;
  }

  const goalData = {
    description,
    targetValue,
    targetDate,
    clientId: finalClientId,
  };

  const goal = await prisma.goal.create({
    data: goalData,
  });

  return goal;
}
