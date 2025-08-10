import { Decimal } from "@prisma/client/runtime/library";

export function calculateMonthlyRate(annualRate: number): Decimal {
  return Decimal(annualRate).div(100).plus(1).pow(Decimal(1).div(12)).minus(1);
}
