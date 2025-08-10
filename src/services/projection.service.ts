import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../lib/prisma";
import { Event } from "@prisma/client";
import { calculateMonthlyRate } from "../utils/finance";

type ProjectionPoint = {
  year: number;
  projectedValue: Decimal;
};

export class ProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionError";
  }
}

function calculateValueAfterEvents(events: Event[], currentValue: Decimal) {
  return events.reduce((acc, event) => {
    const signedValue =
      event.category === "INCOME" ? event.value : event.value.neg();
    return acc.plus(signedValue);
  }, currentValue);
}

export function simulateWealthCurve(
  initialValue: Decimal,
  events: Event[],
  annualRate: number = 4
): ProjectionPoint[] {
  let currentValue = initialValue;
  const projectionResults: ProjectionPoint[] = [];

  const projectionEndDate = new Date("2061-01-01");
  const now = new Date();

  const monthlyRate = calculateMonthlyRate(annualRate);

  const uniqueEvents = events.filter((e) => e.frequency === "UNIQUE");
  const monthlyEvents = events.filter((e) => e.frequency === "MONTHLY");
  const annualEvents = events.filter((e) => e.frequency === "ANNUAL");

  currentValue = calculateValueAfterEvents(uniqueEvents, currentValue);

  const currentDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);

  while (currentDate < projectionEndDate) {
    const currentMonth = currentDate.getUTCMonth();

    if (currentMonth === 0) {
      currentValue = calculateValueAfterEvents(annualEvents, currentValue);
    }

    currentValue = calculateValueAfterEvents(monthlyEvents, currentValue);
    currentValue = currentValue.times(monthlyRate.plus(1));

    if (currentMonth === 11) {
      const currentYear = currentDate.getFullYear();
      if (currentYear <= 2060) {
        projectionResults.push({
          year: currentYear,
          projectedValue: currentValue,
        });
      }
    }

    currentDate.setMonth(currentDate.getUTCMonth() + 1);
  }

  return projectionResults;
}

export async function generateProjectionForClient(
  clientId: string,
  annualRate: number = 4
) {
  const [wallet, events] = await prisma.$transaction([
    prisma.wallet.findUnique({ where: { clientId } }),
    prisma.event.findMany({ where: { clientId } }),
  ]);

  if (!wallet) {
    throw new ProjectionError(
      "Cliente não possui uma carteira cadastrada para iniciar a projeção."
    );
  }

  return simulateWealthCurve(wallet.totalValue, events, annualRate);
}
