import request from "supertest";
import { app } from "../../server";
import { prisma } from "../../lib/prisma";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { loginAndGetToken } from "./utils/auth-helper";
import { createTestClient } from "./factories/client-factory";
import {
  createTestInsurance,
  TEST_COVERAGE_VALUE,
} from "./factories/insurance-factory";

describe("Insurance Routes (CRUD)", () => {
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
    await prisma.insurance.deleteMany({
      where: {
        coverageValue: {
          equals: TEST_COVERAGE_VALUE,
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

  describe("POST /clients/:clientId/insurances", () => {
    it("should allow an ADVISOR to create a new insurance for a client", async () => {
      const client = await createTestClient();

      const response = await request(app.server)
        .post(`/clients/${client.id}/insurances`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          type: "DISABILITY",
          coverageValue: TEST_COVERAGE_VALUE,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("type");
      expect(response.body.clientId).toBe(client.id);
      expect(response.body.type).toBe("DISABILITY");
    });

    it("should return 403 if a VIEWER tries to add an insurance to a client", async () => {
      const client = await createTestClient();
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      const response = await request(app.server)
        .post(`/clients/${client.id}/insurances`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          type: "LIFE",
          coverageValue: TEST_COVERAGE_VALUE,
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 if the client ID does not exist", async () => {
      const nonExistentClientId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .post(`/clients/${nonExistentClientId}/insurances`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ type: "DISABILITY", coverageValue: TEST_COVERAGE_VALUE });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /clients/:clientId/insurances", () => {
    it("should allow an ADVISOR to list all insurances for a specific client", async () => {
      const client = await createTestClient();
      await createTestInsurance({ clientId: client.id });
      await createTestInsurance({ clientId: client.id });
      await createTestInsurance();

      const response = await request(app.server)
        .get(`/clients/${client.id}/insurances`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.insurances).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });

    it("should allow a VIEWER to list THEIR OWN insurances", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      await createTestInsurance({ clientId: viewer.clientId! });
      await createTestInsurance({ clientId: viewer.clientId! });
      await createTestInsurance();

      const response = await request(app.server)
        .get(`/clients/${viewer.clientId}/insurances`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.insurances).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });

    it("should return 403 if a VIEWER tries to list the insurances of ANOTHER client", async () => {
      const targetClient = await createTestClient();
      await createTestInsurance({ clientId: targetClient.id });

      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .get(`/clients/${targetClient.id}/insurances`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /insurances/:insuranceId", () => {
    it("should allow an ADVISOR to get a specific insurance by its ID", async () => {
      const insurance = await createTestInsurance();

      const response = await request(app.server)
        .get(`/insurances/${insurance.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("coverageValue");
      expect(response.body.id).toBe(insurance.id);
      expect(response.body.coverageValue).toBe(TEST_COVERAGE_VALUE.toString());
    });

    it("should allow a VIEWER to get THEIR OWN specific insurance by ID", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);
      const insurance = await createTestInsurance({
        clientId: viewer.clientId!,
      });

      const response = await request(app.server)
        .get(`/insurances/${insurance.id}`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body.id).toBe(insurance.id);
    });

    it("should return 403 if a VIEWER tries to get an insurance of ANOTHER client", async () => {
      const targetInsurance = await createTestInsurance();
      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .get(`/insurances/${targetInsurance.id}`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 for a non-existent insurance ID", async () => {
      const nonExistentInsuranceId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .get(`/insurances/${nonExistentInsuranceId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("PUT /insurances/:insuranceId", () => {
    it("should allow an ADVISOR to update an insurance", async () => {
      const insurance = await createTestInsurance({ type: "LIFE" });

      const response = await request(app.server)
        .put(`/insurances/${insurance.id}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ type: "DISABILITY" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("type");
      expect(response.body.type).toBe("DISABILITY");
    });

    it("should return 403 if a VIEWER tries to update an insurance", async () => {
      const insurance = await createTestInsurance({ type: "LIFE" });
      const { user, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(user.email, plainPassword);

      const response = await request(app.server)
        .put(`/insurances/${insurance.id}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ type: "DISABILITY" });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
      expect(response.body).not.toHaveProperty("type");
    });

    it("should return 404 when trying to update a non-existent insurance", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const response = await request(app.server)
        .put(`/insurances/${nonExistentId}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ description: "Descrição" });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("DELETE /insurances/:insuranceId", () => {
    it("should allow an ADVISOR to delete an insurance", async () => {
      const insurance = await createTestInsurance();

      const response = await request(app.server)
        .delete(`/insurances/${insurance.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(204);

      const deletedInsurance = await prisma.insurance.findUnique({
        where: { id: insurance.id },
      });
      expect(deletedInsurance).toBeNull();
    });

    it("should return 404 when trying to delete a non-existent insurance", async () => {
      const nonExistentInsuranceId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .delete(`/insurances/${nonExistentInsuranceId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 403 if a VIEWER tries to delete an insurance", async () => {
      const insurance = await createTestInsurance();
      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .delete(`/insurances/${insurance.id}`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");

      const stillExists = await prisma.insurance.findUnique({
        where: { id: insurance.id },
      });
      expect(stillExists).not.toBeNull();
    });
  });
});
