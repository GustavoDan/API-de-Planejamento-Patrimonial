import request from "supertest";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { loginAndGetToken } from "./utils/auth-helper";
import { prisma } from "../../lib/prisma";
import { createTestWallet, TEST_ASSET_CLASS } from "./factories/wallet-factory";
import { TEST_EVENT_DESCRIPTION_SUFFIX } from "./factories/event-factory";
import { app } from "../../server";
import { createTestClient } from "./factories/client-factory";
import { Decimal } from "@prisma/client/runtime/library";
import { calculateMonthlyRate } from "../../utils/finance";

describe("Simulation Routes (POST /projections)", () => {
  let advisorToken: string;

  beforeEach(async () => {
    const { user: advisor, plainPassword } = await createTestUser({
      role: "ADVISOR",
    });
    advisorToken = await loginAndGetToken(advisor.email, plainPassword);
  });

  afterEach(async () => {
    await prisma.event.deleteMany({
      where: {
        description: {
          endsWith: TEST_EVENT_DESCRIPTION_SUFFIX,
        },
      },
    });
    await prisma.wallet.deleteMany({
      where: {
        assetClasses: {
          equals: TEST_ASSET_CLASS,
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          endsWith: TEST_EMAIL_SUFFIX,
        },
      },
    });
    await prisma.client.deleteMany({
      where: {
        email: {
          endsWith: TEST_EMAIL_SUFFIX,
        },
      },
    });
  });

  beforeAll(async () => {
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("should allow an ADVISOR to generate a projection for a client successfully", async () => {
    const client = await createTestClient();
    await createTestWallet({ clientId: client.id, totalValue: 100000 });

    const response = await request(app.server)
      .post(`/clients/${client.id}/projections`)
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({ annualRate: 5 });

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toHaveProperty("year");
    expect(response.body[0]).toHaveProperty("projectedValue");
    expect(typeof response.body[0].projectedValue).toBe("string");
  });

  it("should allow a VIEWER to generate a projection for THEMSELVES", async () => {
    const { user: viewer, plainPassword } = await createTestUser({
      role: "VIEWER",
    });
    const viewerToken = await loginAndGetToken(viewer.email, plainPassword);
    await createTestWallet({ clientId: viewer.clientId!, totalValue: 50000 });

    const response = await request(app.server)
      .post(`/clients/${viewer.clientId}/projections`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ annualRate: 6 });

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toHaveProperty("year");
    expect(response.body[0]).toHaveProperty("projectedValue");
    expect(typeof response.body[0].projectedValue).toBe("string");
  });

  it("should return 401 if authentication token is not provided", async () => {
    const targetClient = await createTestClient();

    const response = await request(app.server).get(
      `/clients/${targetClient.id}/alignment`
    );

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message");
  });

  it("should return 403 if a VIEWER tries to generate a projection for ANOTHER client", async () => {
    const targetClient = await createTestClient();
    const { user: attacker, plainPassword } = await createTestUser({
      role: "VIEWER",
    });
    const attackerToken = await loginAndGetToken(attacker.email, plainPassword);

    const response = await request(app.server)
      .post(`/clients/${targetClient.id}/projections`)
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({ annualRate: 5 });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("message");
  });

  it("should return 400 if the client does not have a wallet", async () => {
    const client = await createTestClient();

    const response = await request(app.server)
      .post(`/clients/${client.id}/projections`)
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({ annualRate: 5 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("message");
  });

  it("should use the default annual rate of 4% if none is provided", async () => {
    const client = await createTestClient();
    const initialValue = 100000;
    await createTestWallet({ clientId: client.id, totalValue: initialValue });

    const response = await request(app.server)
      .post(`/clients/${client.id}/projections`)
      .set("Authorization", `Bearer ${advisorToken}`)
      .send({});

    expect(response.status).toBe(200);

    const now = new Date();
    const monthsRemainingInYear = 12 - now.getMonth();
    const monthlyRate = calculateMonthlyRate(4);

    const expectedValue = Decimal(initialValue).times(
      monthlyRate.plus(1).pow(monthsRemainingInYear)
    );
    const firstYearProjectedValue = parseFloat(response.body[0].projectedValue);

    expect(firstYearProjectedValue).toBeCloseTo(expectedValue.toNumber(), 2);
  });
});
