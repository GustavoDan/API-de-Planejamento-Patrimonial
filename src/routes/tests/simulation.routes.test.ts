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
import {
  createTestSimulation,
  TEST_PROJECTION,
} from "./factories/simulation-factory";

describe("Simulation & Projection Routes", () => {
  let advisorToken: string;

  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(async () => {
    const { user: advisor, plainPassword } = await createTestUser({
      role: "ADVISOR",
    });
    advisorToken = await loginAndGetToken(advisor.email, plainPassword);
  });

  afterEach(async () => {
    await prisma.simulation.deleteMany({
      where: {
        projection: {
          equals: TEST_PROJECTION,
        },
      },
    });
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

  afterAll(async () => {
    await app.close();
  });

  describe("POST /clients/:clientId/projections", () => {
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
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

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
      const firstYearProjectedValue = parseFloat(
        response.body[0].projectedValue
      );

      expect(firstYearProjectedValue).toBeCloseTo(expectedValue.toNumber(), 2);
    });
  });

  describe("Simulation Management (/simulations)", () => {
    describe("POST /clients/:clientId/simulations", () => {
      it("should allow an ADVISOR to save a simulation for a client", async () => {
        const client = await createTestClient();

        const response = await request(app.server)
          .post(`/clients/${client.id}/simulations`)
          .set("Authorization", `Bearer ${advisorToken}`)
          .send({
            projectionData: TEST_PROJECTION,
            rate: 5,
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.clientId).toBe(client.id);
      });

      it("should allow a VIEWER to save a simulation for THEMSELVES", async () => {
        const { user: viewer, plainPassword } = await createTestUser({
          role: "VIEWER",
        });
        const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

        const response = await request(app.server)
          .post(`/clients/${viewer.clientId}/simulations`)
          .set("Authorization", `Bearer ${viewerToken}`)
          .send({
            projectionData: TEST_PROJECTION,
            rate: 5,
          });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty("id");
        expect(response.body.clientId).toBe(viewer.clientId);
      });

      it("should return 403 if a VIEWER tries to save a simulation for ANOTHER client", async () => {
        const targetClient = await createTestClient();
        const { user: viewer, plainPassword } = await createTestUser({
          role: "VIEWER",
        });
        const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

        const response = await request(app.server)
          .post(`/clients/${targetClient.id}/simulations`)
          .set("Authorization", `Bearer ${viewerToken}`)
          .send({
            projectionData: TEST_PROJECTION,
            rate: 5,
          });

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("message");
      });

      it("should return 404 if trying to save a simulation for a non-existent client ID", async () => {
        const nonExistentClientId = "00000000-0000-0000-0000-000000000000";

        const response = await request(app.server)
          .post(`/clients/${nonExistentClientId}/simulations`)
          .set("Authorization", `Bearer ${advisorToken}`)
          .send({
            projectionData: TEST_PROJECTION,
            rate: 5,
          });

        expect(response.status).toBe(404);
        expect(response.body.message).toContain("Cliente não encontrado");
      });
    });

    describe("GET /clients/:clientId/simulations", () => {
      it("should allow an ADVISOR to list simulations for any client", async () => {
        const targetClient = await createTestClient();
        await createTestSimulation({ clientId: targetClient.id! });
        await createTestSimulation({ clientId: targetClient.id! });
        await createTestSimulation();

        const response = await request(app.server)
          .get(`/clients/${targetClient.id}/simulations`)
          .set("Authorization", `Bearer ${advisorToken}`);

        expect(response.status).toBe(200);
        expect(response.body.simulations).toHaveLength(2);
        expect(response.body.meta.total).toBe(2);
      });

      it("should allow a VIEWER to list THEIR OWN saved simulations", async () => {
        const { user: viewer, plainPassword } = await createTestUser({
          role: "VIEWER",
        });
        const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

        await createTestSimulation({ clientId: viewer.clientId! });
        await createTestSimulation({ clientId: viewer.clientId! });
        await createTestSimulation();

        const response = await request(app.server)
          .get(`/clients/${viewer.clientId}/simulations`)
          .set("Authorization", `Bearer ${viewerToken}`);

        expect(response.status).toBe(200);
        expect(response.body.simulations).toHaveLength(2);
        expect(response.body.meta.total).toBe(2);
      });

      it("should return 403 if a VIEWER tries to list simulations of ANOTHER client", async () => {
        const targetClient = await createTestClient();
        await createTestSimulation({ clientId: targetClient.id });

        const { user: attacker, plainPassword } = await createTestUser({
          role: "VIEWER",
        });
        const attackerToken = await loginAndGetToken(
          attacker.email,
          plainPassword
        );

        const response = await request(app.server)
          .get(`/clients/${targetClient.id}/simulations`)
          .set("Authorization", `Bearer ${attackerToken}`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("message");
      });
    });

    describe("GET /simulations/:simulationId", () => {
      it("should allow an ADVISOR to get any specific saved simulation", async () => {
        const simulation = await createTestSimulation();

        const response = await request(app.server)
          .get(`/simulations/${simulation.id}`)
          .set("Authorization", `Bearer ${advisorToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("id");
        expect(response.body.id).toBe(simulation.id);
      });

      it("should allow a VIEWER to get THEIR OWN specific simulation by ID", async () => {
        const { user: viewer, plainPassword } = await createTestUser({
          role: "VIEWER",
        });
        const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

        const simulation = await createTestSimulation({
          clientId: viewer.clientId!,
        });

        const response = await request(app.server)
          .get(`/simulations/${simulation.id}`)
          .set("Authorization", `Bearer ${viewerToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("id");
        expect(response.body).toHaveProperty("clientId");
        expect(response.body.id).toBe(simulation.id);
        expect(response.body.clientId).toBe(viewer.clientId);
      });

      it("should return 403 if a VIEWER tries to get a simulation of ANOTHER client", async () => {
        const targetSimulation = await createTestSimulation();

        const { user: attacker, plainPassword } = await createTestUser({
          role: "VIEWER",
        });
        const attackerToken = await loginAndGetToken(
          attacker.email,
          plainPassword
        );

        const response = await request(app.server)
          .get(`/simulations/${targetSimulation.id}`)
          .set("Authorization", `Bearer ${attackerToken}`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("message");
      });

      it("should return 404 for a non-existent simulation ID", async () => {
        const nonExistentId = "00000000-0000-0000-0000-000000000000";

        const response = await request(app.server)
          .get(`/simulations/${nonExistentId}`)
          .set("Authorization", `Bearer ${advisorToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty("message");
      });
    });

    describe("DELETE /simulations/:simulationId", () => {
      it("should allow an ADVISOR to delete a simulation", async () => {
        const simulation = await createTestSimulation();

        const deleteResponse = await request(app.server)
          .delete(`/simulations/${simulation.id}`)
          .set("Authorization", `Bearer ${advisorToken}`);

        expect(deleteResponse.status).toBe(204);

        const deletedSimulation = await prisma.simulation.findUnique({
          where: { id: simulation.id },
        });
        expect(deletedSimulation).toBeNull();
      });

      it("should allow a VIEWER to delete THEIR OWN simulation", async () => {
        const { user: viewer, plainPassword } = await createTestUser({
          role: "VIEWER",
        });
        const viewerToken = await loginAndGetToken(viewer.email, plainPassword);
        const simulation = await createTestSimulation({
          clientId: viewer.clientId!,
        });

        const response = await request(app.server)
          .delete(`/simulations/${simulation.id}`)
          .set("Authorization", `Bearer ${viewerToken}`);

        expect(response.status).toBe(204);

        const deletedSimulation = await prisma.simulation.findUnique({
          where: { id: simulation.id },
        });
        expect(deletedSimulation).toBeNull();
      });

      it("should return 404 when an ADVISOR tries to delete a non-existent simulation", async () => {
        const nonExistentId = "00000000-0000-0000-0000-000000000000";

        const response = await request(app.server)
          .delete(`/simulations/${nonExistentId}`)
          .set("Authorization", `Bearer ${advisorToken}`);

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty("message");
      });

      it("should return 403 if a VIEWER tries to delete a simulation of ANOTHER client", async () => {
        const targetSimulation = await createTestSimulation();
        const { user, plainPassword } = await createTestUser({
          role: "VIEWER",
        });
        const attackerToken = await loginAndGetToken(user.email, plainPassword);

        const response = await request(app.server)
          .delete(`/simulations/${targetSimulation.id}`)
          .set("Authorization", `Bearer ${attackerToken}`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty("message");

        const stillExists = await prisma.simulation.findUnique({
          where: { id: targetSimulation.id },
        });
        expect(stillExists).not.toBeNull();
      });
    });
  });
});
