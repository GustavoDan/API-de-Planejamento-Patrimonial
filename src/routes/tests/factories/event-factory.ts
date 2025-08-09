import { prisma } from "../../../lib/prisma";
import { createTestClient } from "./client-factory";

interface CreateEventOptions {
  clientId?: string;
  overrides?: {
    descriptionPrefix?: string;
    category?: "INCOME" | "EXPENSE";
    value?: number;
    frequency?: "UNIQUE" | "MONTHLY" | "ANNUAL";
  };
}

export const TEST_EVENT_DESCRIPTION_SUFFIX = "META     TESTE123   4567   98";

export const getTestEventDescription = (prefix?: string) => {
  return `${prefix}${TEST_EVENT_DESCRIPTION_SUFFIX}`;
};

export async function createTestEvent(options: CreateEventOptions = {}) {
  const { clientId, overrides = {} } = options;
  const {
    descriptionPrefix,
    category = "INCOME",
    value = 5000,
    frequency = "UNIQUE",
  } = overrides;
  const description = getTestEventDescription(descriptionPrefix);

  let finalClientId = clientId;

  if (!finalClientId) {
    const client = await createTestClient();
    finalClientId = client.id;
  }

  const eventData = {
    description: description,
    category: category,
    value: value,
    frequency: frequency,
    clientId: finalClientId,
  };

  const event = await prisma.event.create({
    data: eventData,
  });

  return event;
}
