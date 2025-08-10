import { Event } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { simulateWealthCurve } from "../projection.service";
import { calculateMonthlyRate } from "../../utils/finance";

function createMockEvent(
  value: number,
  category: "INCOME" | "EXPENSE",
  frequency: "UNIQUE" | "MONTHLY" | "ANNUAL"
): Event {
  return {
    id: "mock-id",
    clientId: "mock-client-id",
    description: "mock",
    createdAt: new Date(),
    updatedAt: new Date(),
    value: Decimal(value),
    category,
    frequency,
  };
}

describe("Projection Engine (simulateWealthCurve) - Output Integrity", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Compound Interest Logic", () => {
    it("should correctly project wealth with only compound interest for the remaining months of the first year", () => {
      jest.setSystemTime(new Date("2025-05-15"));
      const initialValue = Decimal(100000);
      const events: Event[] = [];
      const annualRate = 10;

      const projection = simulateWealthCurve(initialValue, events, annualRate);

      const now = new Date();
      const firstYearInProjection = now.getUTCFullYear();
      const firstYearResult = projection.find(
        (p) => p.year === firstYearInProjection
      );

      expect(firstYearResult).toBeDefined();

      const monthsRemainingInYear = 12 - now.getUTCMonth();
      const monthlyRate = calculateMonthlyRate(annualRate);

      const expectedValueFirstYear = Decimal(initialValue).times(
        monthlyRate.plus(1).pow(monthsRemainingInYear)
      );

      expect(firstYearResult!.projectedValue.toNumber()).toBeCloseTo(
        expectedValueFirstYear.toNumber(),
        2
      );
    });

    it("should correctly project wealth with only compound interest when starting in January", () => {
      jest.setSystemTime(new Date("2025-01-01"));
      const initialValue = Decimal(100000);
      const events: Event[] = [];
      const annualRate = 10;

      const projection = simulateWealthCurve(initialValue, events, annualRate);

      const now = new Date();
      const firstYearInProjection = now.getUTCFullYear();
      const firstYearResult = projection.find(
        (p) => p.year === firstYearInProjection
      );

      expect(firstYearResult).toBeDefined();

      const monthsRemainingInYear = 12 - now.getUTCMonth();
      const monthlyRate = calculateMonthlyRate(annualRate);

      const expectedValueFirstYear = Decimal(initialValue).times(
        monthlyRate.plus(1).pow(monthsRemainingInYear)
      );

      expect(firstYearResult!.projectedValue.toNumber()).toBeCloseTo(
        expectedValueFirstYear.toNumber(),
        2
      );
    });

    it("should project a full year of interest for subsequent years", () => {
      const initialValue = Decimal(100000);
      const events: Event[] = [];
      const annualRate = 10;

      const projection = simulateWealthCurve(initialValue, events, annualRate);

      const now = new Date();
      const firstYearInProjection = now.getUTCFullYear();
      const secondYearInProjection = firstYearInProjection + 1;

      const firstYearResult = projection.find(
        (p) => p.year === firstYearInProjection
      );
      const secondYearResult = projection.find(
        (p) => p.year === secondYearInProjection
      );

      expect(firstYearResult).toBeDefined();
      expect(secondYearResult).toBeDefined();

      const expectedValueSecondYear = firstYearResult!.projectedValue.times(
        Decimal(annualRate).div(100).plus(1)
      );

      expect(secondYearResult!.projectedValue.toNumber()).toBeCloseTo(
        expectedValueSecondYear.toNumber(),
        2
      );
    });

    it("should return a flat line if the rate is zero", () => {
      const initialValue = Decimal(50000);

      const projection = simulateWealthCurve(initialValue, [], 0);
      const firstYear = projection.find(
        (p) => p.year === new Date().getUTCFullYear()
      );

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        initialValue.toString()
      );
    });
  });

  describe("Events Logic", () => {
    it("should apply a unique income event at the beginning", () => {
      const initialValue = Decimal(100000);
      const events = [createMockEvent(50000, "INCOME", "UNIQUE")];
      const projection = simulateWealthCurve(initialValue, events, 0);

      const firstYear = projection.find(
        (p) => p.year === new Date().getUTCFullYear()
      );

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        initialValue.plus(events[0].value).toString()
      );
    });

    it("should apply monthly income events for the remaining months of the first year", () => {
      jest.setSystemTime(new Date("2025-05-15"));
      const initialValue = Decimal(0);
      const eventValue = 1000;
      const events = [createMockEvent(eventValue, "INCOME", "MONTHLY")];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const now = new Date();
      const monthsRemaining = 12 - now.getUTCMonth();
      const expectedValue = initialValue.plus(eventValue * monthsRemaining);

      const firstYear = projection.find((p) => p.year === now.getUTCFullYear());

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        expectedValue.toString()
      );
    });

    it("should apply monthly income events correctly over a full subsequent year", () => {
      jest.setSystemTime(new Date("2025-05-15"));
      const initialValue = Decimal(0);
      const eventValue = 1000;
      const events = [createMockEvent(eventValue, "INCOME", "MONTHLY")];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const currenYear = new Date().getUTCFullYear();

      const firstYear = projection.find((p) => p.year === currenYear);
      const secondYear = projection.find((p) => p.year === currenYear + 1);
      expect(firstYear).toBeDefined();
      expect(secondYear).toBeDefined();

      const expectedSecondYearValue = firstYear!.projectedValue.plus(
        eventValue * 12
      );
      expect(secondYear!.projectedValue.toString()).toBe(
        expectedSecondYearValue.toString()
      );
    });

    it("should apply monthly expense events for the remaining months of the first year", () => {
      jest.setSystemTime(new Date("2025-05-15"));
      const initialValue = Decimal(20000);
      const eventValue = 1000;
      const events = [createMockEvent(eventValue, "EXPENSE", "MONTHLY")];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const now = new Date();
      const monthsRemaining = 12 - now.getUTCMonth();
      const expectedValue = initialValue.minus(eventValue * monthsRemaining);

      const firstYear = projection.find((p) => p.year === now.getUTCFullYear());

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        expectedValue.toString()
      );
    });

    it("should apply monthly expense events correctly over a full subsequent year", () => {
      jest.setSystemTime(new Date("2025-05-15"));
      const initialValue = Decimal(20000);
      const eventValue = 1000;
      const events = [createMockEvent(eventValue, "EXPENSE", "MONTHLY")];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const currenYear = new Date().getUTCFullYear();

      const firstYear = projection.find((p) => p.year === currenYear);
      const secondYear = projection.find((p) => p.year === currenYear + 1);
      expect(firstYear).toBeDefined();
      expect(secondYear).toBeDefined();

      const expectedSecondYearValue = firstYear!.projectedValue.minus(
        eventValue * 12
      );
      expect(secondYear!.projectedValue.toString()).toBe(
        expectedSecondYearValue.toString()
      );
    });

    it("should correctly net multiple monthly income and expense events", () => {
      jest.setSystemTime(new Date("2025-09-10"));
      const initialValue = Decimal(10000);
      const incomeEventValue = 1000;
      const expenseEventValue = 300;
      const events = [
        createMockEvent(incomeEventValue, "INCOME", "MONTHLY"),
        createMockEvent(expenseEventValue, "EXPENSE", "MONTHLY"),
      ];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const now = new Date();
      const monthsRemaining = 12 - now.getUTCMonth();
      const expectedValue = initialValue.plus(
        (incomeEventValue - expenseEventValue) * monthsRemaining
      );
      const firstYear = projection.find((p) => p.year === now.getUTCFullYear());

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        expectedValue.toString()
      );
    });

    it("should apply annual income events in January", () => {
      jest.setSystemTime(new Date("2025-01-01"));
      const initialValue = Decimal(0);
      const eventValue = 1000;
      const events = [createMockEvent(eventValue, "INCOME", "ANNUAL")];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const firstYear = projection.find(
        (p) => p.year === new Date().getUTCFullYear()
      );

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        initialValue.plus(eventValue).toString()
      );
    });

    it("should NOT apply an annual event in the first year if the simulation starts after January", () => {
      jest.setSystemTime(new Date("2025-02-01"));
      const initialValue = Decimal(10000);
      const eventValue = 5000;
      const events = [createMockEvent(eventValue, "INCOME", "ANNUAL")];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const firstYear = projection.find(
        (p) => p.year === new Date().getUTCFullYear()
      );

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        initialValue.toString()
      );
    });

    it("should apply an annual event in subsequent years", () => {
      jest.setSystemTime(new Date("2025-02-01"));
      const initialValue = Decimal(10000);
      const eventValue = 5000;
      const events = [createMockEvent(eventValue, "INCOME", "ANNUAL")];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const secondYear = projection.find(
        (p) => p.year === new Date().getUTCFullYear() + 1
      );

      expect(secondYear).toBeDefined();
      expect(secondYear!.projectedValue.toString()).toBe(
        initialValue.plus(eventValue).toString()
      );
    });
  });

  describe("Order of Operations", () => {
    it("should apply monthly events BEFORE calculating compound interest for that month", () => {
      jest.setSystemTime(new Date("2025-01-01"));

      const initialValue = Decimal(1000);
      const eventValue = 100;
      const events = [createMockEvent(eventValue, "INCOME", "MONTHLY")];
      const annualRate = 10;

      const projection = simulateWealthCurve(initialValue, events, annualRate);

      const now = new Date();
      const monthlyRate = calculateMonthlyRate(annualRate);
      let correctOrderValue = initialValue;
      let incorrectOrderValue = initialValue;

      for (let i = now.getUTCMonth(); i < 12; i++) {
        correctOrderValue = correctOrderValue
          .plus(100)
          .times(monthlyRate.plus(1));

        incorrectOrderValue = incorrectOrderValue
          .times(monthlyRate.plus(1))
          .plus(100);
      }

      const resultValue = projection.find(
        (p) => p.year === now.getUTCFullYear()
      )!.projectedValue;

      expect(resultValue.toNumber()).toBeCloseTo(
        correctOrderValue.toNumber(),
        2
      );
      expect(resultValue.toNumber()).not.toBeCloseTo(
        incorrectOrderValue.toNumber(),
        2
      );
    });

    it("should have no impact on the projection if a monthly event has a value of zero", () => {
      jest.setSystemTime(new Date("2025-01-01"));
      const initialValue = Decimal(100000);
      const eventValue = 500;
      const events = [
        createMockEvent(eventValue, "INCOME", "MONTHLY"),
        createMockEvent(0, "EXPENSE", "MONTHLY"),
      ];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const now = new Date();
      const monthsRemaining = 12 - now.getUTCMonth();
      const expectedValue = initialValue.plus(eventValue * monthsRemaining);
      const firstYear = projection.find((p) => p.year === now.getUTCFullYear());

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        expectedValue.toString()
      );
    });

    it("should have no impact on the projection if an annual event has a value of zero", () => {
      jest.setSystemTime(new Date("2025-01-01"));
      const initialValue = Decimal(100000);
      const eventValue = 5000;
      const events = [
        createMockEvent(eventValue, "INCOME", "ANNUAL"),
        createMockEvent(0, "EXPENSE", "ANNUAL"),
      ];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const expectedValue = initialValue.plus(eventValue);
      const firstYear = projection.find(
        (p) => p.year === new Date().getUTCFullYear()
      );

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toString()).toBe(
        expectedValue.toString()
      );
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle negative wealth (debt)", () => {
      const initialValue = Decimal(5000);
      const eventValue = 10000;
      const events = [createMockEvent(eventValue, "EXPENSE", "UNIQUE")];

      const projection = simulateWealthCurve(initialValue, events, 0);

      const firstYear = projection.find(
        (p) => p.year === new Date().getUTCFullYear()
      );

      expect(firstYear!.projectedValue.toString()).toBe(
        initialValue.minus(eventValue).toString()
      );
    });

    it("should handle negative wealth (debt) and apply interest correctly for the first year", () => {
      jest.setSystemTime(new Date("2025-05-15"));

      const initialValue = Decimal(5000);
      const eventValue = 10000;
      const events = [createMockEvent(eventValue, "EXPENSE", "UNIQUE")];
      const annualRate = 10;

      const projection = simulateWealthCurve(initialValue, events, annualRate);

      const initialDebt = initialValue.minus(eventValue);

      const now = new Date();
      const monthsRemaining = 12 - now.getUTCMonth();
      const monthlyRate = calculateMonthlyRate(annualRate);
      const expectedValueAtYearEnd = initialDebt.times(
        monthlyRate.plus(1).pow(monthsRemaining)
      );

      const firstYear = projection.find((p) => p.year === now.getUTCFullYear());

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toNumber()).toBeCloseTo(
        expectedValueAtYearEnd.toNumber(),
        2
      );
      expect(firstYear!.projectedValue.toNumber()).toBeLessThan(
        initialDebt.toNumber()
      );
    });

    it("should correctly combine compound interest, monthly and annual events", () => {
      jest.setSystemTime(new Date("2025-01-01"));
      const initialValue = Decimal(100000);
      const eventsValues = [1000, 5000, 200];
      const events = [
        createMockEvent(eventsValues[0], "INCOME", "MONTHLY"),
        createMockEvent(eventsValues[1], "INCOME", "ANNUAL"),
        createMockEvent(eventsValues[2], "EXPENSE", "MONTHLY"),
      ];
      const annualRate = 5;

      const projection = simulateWealthCurve(initialValue, events, annualRate);

      const now = new Date();
      const currentYear = now.getUTCFullYear();
      const monthlyRate = calculateMonthlyRate(annualRate);
      const netMonthlyEventValue = eventsValues[0] - eventsValues[2];
      const annualEventValue = eventsValues[1];

      let expectedValue = initialValue;

      for (let month = now.getUTCMonth(); month < 12; month++) {
        if (month === 0) {
          expectedValue = expectedValue.plus(annualEventValue);
        }

        expectedValue = expectedValue
          .plus(netMonthlyEventValue)
          .times(monthlyRate.plus(1));
      }

      const firstYear = projection.find((p) => p.year === currentYear);

      expect(firstYear).toBeDefined();
      expect(firstYear!.projectedValue.toNumber()).toBeCloseTo(
        expectedValue.toNumber(),
        2
      );
    });
  });
});

describe("Projection Engine (simulateWealthCurve) - Output Structure Integrity", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should return a projection up to the year 2060, inclusive", () => {
    const startYear = 2025;
    jest.setSystemTime(new Date(`${startYear}-01-01`));
    const initialValue = Decimal(1000);

    const projection = simulateWealthCurve(initialValue, [], 0);

    const endYear = 2060;
    const expectedNumberOfYears = endYear - startYear + 1;

    expect(projection.length).toBe(expectedNumberOfYears);
    expect(projection[0].year).toBe(startYear);
    expect(projection[projection.length - 1].year).toBe(endYear);
  });

  it("should return all years in ascending and consecutive order", () => {
    const startYear = 2025;
    jest.setSystemTime(new Date(`${startYear}-01-01`));
    const initialValue = Decimal(1000);

    const projection = simulateWealthCurve(initialValue, [], 0);

    projection.forEach((p, i) => {
      expect(p.year).toBe(startYear + i);
    });
  });

  it("should ensure projectedValue for every year is a valid, non-NaN number", () => {
    const initialValue = Decimal(5000).neg();
    const events = [
      createMockEvent(100, "INCOME", "MONTHLY"),
      createMockEvent(50, "EXPENSE", "MONTHLY"),
      createMockEvent(1000, "INCOME", "ANNUAL"),
    ];
    const annualRate = 7.3;

    const projection = simulateWealthCurve(initialValue, events, annualRate);

    projection.forEach((point) => {
      expect(point.projectedValue).toBeDefined();
      expect(point.projectedValue).not.toBeNull();
      expect(isFinite(point.projectedValue.toNumber())).toBe(true);
    });
  });
});
