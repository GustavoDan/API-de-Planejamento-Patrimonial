import request from "supertest";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { loginAndGetToken } from "./utils/auth-helper";
import { prisma } from "../../lib/prisma";
import {
  createTestGoal,
  TEST_GOAL_DESCRIPTION_SUFFIX,
} from "./factories/goal-factory";
import { createTestWallet, TEST_ASSET_CLASS } from "./factories/wallet-factory";
import { app } from "../../server";
import { createTestClient } from "./factories/client-factory";

const businessLogicTestCases = [
  { category: "green", patrimony: 100 },
  { category: "green", patrimony: 95 },
  { category: "green", patrimony: 90.01 },
  { category: "yellow-light", patrimony: 90 },
  { category: "yellow-light", patrimony: 80 },
  { category: "yellow-light", patrimony: 70 },
  { category: "yellow-dark", patrimony: 69.99 },
  { category: "yellow-dark", patrimony: 60 },
  { category: "yellow-dark", patrimony: 50 },
  { category: "red", patrimony: 49.99 },
  { category: "red", patrimony: 25 },
  { category: "red", patrimony: 1 },
  { category: "red", patrimony: 0 },
];

describe("Planning Routes (GET /alignment)", () => {
  let advisorToken: string;

  beforeEach(async () => {
    const { user: advisor, plainPassword } = await createTestUser({
      role: "ADVISOR",
    });
    advisorToken = await loginAndGetToken(advisor.email, plainPassword);
  });

  afterEach(async () => {
    await prisma.wallet.deleteMany({
      where: {
        assetClasses: {
          equals: TEST_ASSET_CLASS,
        },
      },
    });
    await prisma.goal.deleteMany({
      where: {
        description: {
          endsWith: TEST_GOAL_DESCRIPTION_SUFFIX,
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

  describe("Authorization", () => {
    it("should allow an ADVISOR to get alignment for any client", async () => {
      const client = await createTestClient();
      await createTestWallet({ clientId: client.id });
      await createTestGoal({ clientId: client.id });

      const response = await request(app.server)
        .get(`/clients/${client.id}/alignment`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("alignmentPercentage");
      expect(response.body).toHaveProperty("category");
    });

    it("should allow a VIEWER to get THEIR OWN alignment", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);
      await createTestWallet({ clientId: viewer.clientId! });
      await createTestGoal({ clientId: viewer.clientId! });

      const response = await request(app.server)
        .get(`/clients/${viewer.clientId}/alignment`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("alignmentPercentage");
      expect(response.body).toHaveProperty("category");
    });

    it("should return 401 if authentication token is not provided", async () => {
      const targetClient = await createTestClient();

      const response = await request(app.server).get(
        `/clients/${targetClient.id}/alignment`
      );

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 403 if a VIEWER tries to get alignment of ANOTHER client", async () => {
      const targetClient = await createTestClient();
      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .get(`/clients/${targetClient.id}/alignment`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe.each(businessLogicTestCases)(
    "Business Logic - Single Goal Alignment",
    ({ category, patrimony = 0 }) => {
      it(`should categorize as "${category}" at ${patrimony}% of alignment`, async () => {
        const client = await createTestClient();
        await createTestWallet({
          clientId: client.id,
          totalValue: patrimony,
        });
        await createTestGoal({
          clientId: client.id,
          overrides: { targetValue: 100 },
        });

        const response = await request(app.server)
          .get(`/clients/${client.id}/alignment`)
          .set("Authorization", `Bearer ${advisorToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("alignmentPercentage");
        expect(response.body).toHaveProperty("category");
        expect(response.body.alignmentPercentage).toBe(patrimony.toString());
        expect(response.body.category).toBe(category);
      });
    }
  );

  describe("Business Logic - Other Alignments", () => {
    it(`should categorize as "green" and 100% alignment with zeroed goals`, async () => {
      const client = await createTestClient();
      await createTestWallet({
        clientId: client.id,
        totalValue: 0,
      });
      await createTestGoal({
        clientId: client.id,
        overrides: { targetValue: 0 },
      });

      const response = await request(app.server)
        .get(`/clients/${client.id}/alignment`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("alignmentPercentage");
      expect(response.body).toHaveProperty("category");
      expect(response.body.alignmentPercentage).toBe("100");
      expect(response.body.category).toBe("green");
    });

    it("should correctly calculate alignment with multiple goals", async () => {
      const client = await createTestClient();
      await createTestWallet({
        clientId: client.id,
        totalValue: 1000,
      });
      await createTestGoal({
        clientId: client.id,
        overrides: { targetValue: 3000 },
      });
      await createTestGoal({
        clientId: client.id,
        overrides: { targetValue: 3000 },
      });
      await createTestGoal({
        clientId: client.id,
        overrides: { targetValue: 4000 },
      });

      const response = await request(app.server)
        .get(`/clients/${client.id}/alignment`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("alignmentPercentage");
      expect(response.body).toHaveProperty("category");
      expect(response.body.alignmentPercentage).toBe("10");
      expect(response.body.category).toBe("red");
    });
  });

  describe("Error Handling", () => {
    it("should return 400 if client has no wallet", async () => {
      const client = await createTestClient();
      await createTestGoal({ clientId: client.id });

      const response = await request(app.server)
        .get(`/clients/${client.id}/alignment`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message");
      expect(response.body).not.toHaveProperty("alignmentPercentage");
      expect(response.body).not.toHaveProperty("category");
    });

    it("should return 400 if client has no goals", async () => {
      const client = await createTestClient();
      await createTestWallet({ clientId: client.id });

      const response = await request(app.server)
        .get(`/clients/${client.id}/alignment`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message");
      expect(response.body).not.toHaveProperty("alignmentPercentage");
      expect(response.body).not.toHaveProperty("category");
    });
  });
});
