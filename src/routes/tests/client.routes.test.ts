import request from "supertest";
import { app } from "../../server";
import { prisma } from "../../lib/prisma";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { loginAndGetToken } from "./utils/auth-helper";
import { createTestClient } from "./factories/client-factory";

describe("Client Routes (CRUD)", () => {
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
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: TEST_EMAIL_SUFFIX,
        },
      },
    });
    await prisma.client.deleteMany({
      where: {
        email: {
          contains: TEST_EMAIL_SUFFIX,
        },
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /clients", () => {
    it("should allow an ADVISOR to create a new client", async () => {
      const clientPayload = {
        name: "João da Silva",
        email: `joao.silva${TEST_EMAIL_SUFFIX}`,
        dateOfBirth: "1980-05-15",
      };

      const response = await request(app.server)
        .post("/clients")
        .set("Authorization", `Bearer ${advisorToken}`)
        .send(clientPayload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.email).toBe(clientPayload.email);
    });

    it("should return 409 if creating a client with an email that already exists", async () => {
      const client = await createTestClient({ emailPrefix: "duplicate" });

      const response = await request(app.server)
        .post("/clients")
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          name: "Cliente Duplicado",
          email: client.email,
          dateOfBirth: "1990-01-01",
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 403 if a VIEWER tries to create a client", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      const response = await request(app.server)
        .post("/clients")
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          name: "Cliente Proibido",
          email: `forbidden${TEST_EMAIL_SUFFIX}`,
          dateOfBirth: new Date(),
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /clients", () => {
    it("should allow an ADVISOR to list clients with pagination", async () => {
      await createTestClient();
      await createTestClient();

      const response = await request(app.server)
        .get("/clients?page=1&pageSize=5")
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("clients");
      expect(response.body).toHaveProperty("meta");
      expect(response.body.clients).toBeInstanceOf(Array);
    });

    it("should return 403 if a VIEWER tries to list clients", async () => {
      const { user, plainPassword } = await createTestUser({ role: "VIEWER" });
      const viewerToken = await loginAndGetToken(user.email, plainPassword);

      const response = await request(app.server)
        .get("/clients")
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /clients/:clientId", () => {
    it("should allow an ADVISOR to get a specific client by ID", async () => {
      const client = await createTestClient();

      const response = await request(app.server)
        .get(`/clients/${client.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("email");
      expect(response.body.id).toBe(client.id);
      expect(response.body.email).toBe(client.email);
    });

    it("should return 404 for a non-existent client ID", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .get(`/clients/${nonExistentId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  it("should return 403 if a VIEWER tries to get a client by ID", async () => {
    const client = await createTestClient();
    const { user, plainPassword } = await createTestUser({
      role: "VIEWER",
    });
    const userToken = await loginAndGetToken(user.email, plainPassword);

    const response = await request(app.server)
      .get(`/clients/${client.id}`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("message");
  });

  describe("PUT /clients/:clientId", () => {
    it("should allow an ADVISOR to update a client's data", async () => {
      const client = await createTestClient();
      const updatePayload = { name: "Nome Atualizado", isActive: false };

      const response = await request(app.server)
        .put(`/clients/${client.id}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send(updatePayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("name");
      expect(response.body).toHaveProperty("isActive");
      expect(response.body.name).toBe("Nome Atualizado");
      expect(response.body.isActive).toBe(false);
    });

    it("should return 403 if a VIEWER tries to update a client", async () => {
      const client = await createTestClient();
      const { user, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(user.email, plainPassword);

      const response = await request(app.server)
        .put(`/clients/${client.id}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ email: `hacked${TEST_EMAIL_SUFFIX}` });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 when trying to update a non-existent client", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .put(`/clients/${nonExistentId}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ name: "Fantasma" });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("DELETE /clients/:clientId", () => {
    it("should allow an ADVISOR to delete a client", async () => {
      const client = await createTestClient();

      const response = await request(app.server)
        .delete(`/clients/${client.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(204);

      const deletedClient = await prisma.client.findUnique({
        where: { id: client.id },
      });
      expect(deletedClient).toBeNull();
    });

    it("should return 404 when trying to delete a non-existent client", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .delete(`/clients/${nonExistentId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 403 if a VIEWER tries to delete a client", async () => {
      const client = await createTestClient();
      const { user, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(user.email, plainPassword);
      const response = await request(app.server)
        .delete(`/clients/${user.id}`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");

      const stillExists = await prisma.client.findUnique({
        where: { id: client.id },
      });
      expect(stillExists).not.toBeNull();
    });
  });
});
