import request from "supertest";
import { app } from "../../server";
import { prisma } from "../../lib/prisma";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { loginAndGetToken } from "./utils/auth-helper";
import { createTestClient } from "./factories/client-factory";
import {
  createTestEvent,
  getTestEventDescription,
  TEST_EVENT_DESCRIPTION_SUFFIX,
} from "./factories/event-factory";

describe("Event Routes (CRUD)", () => {
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
    await prisma.event.deleteMany({
      where: {
        description: {
          endsWith: TEST_EVENT_DESCRIPTION_SUFFIX,
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

  describe("POST /clients/:clientId/events", () => {
    it("should allow an ADVISOR to create a new event for a client", async () => {
      const client = await createTestClient();
      const description = getTestEventDescription("Aporte Mensal");

      const response = await request(app.server)
        .post(`/clients/${client.id}/events`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          description,
          category: "INCOME",
          value: 2000,
          frequency: "MONTHLY",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("description");
      expect(response.body.description).toBe(description);
      expect(response.body.clientId).toBe(client.id);
    });

    it("should return 403 if a VIEWER tries to create a new event for a client", async () => {
      const client = await createTestClient();
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      const response = await request(app.server)
        .post(`/clients/${client.id}/events`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          description: getTestEventDescription("Evento Proibido"),
          category: "INCOME",
          value: 20,
          frequency: "UNIQUE",
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 if the client ID does not exist", async () => {
      const nonExistentClientId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .post(`/clients/${nonExistentClientId}/events`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          description: getTestEventDescription("Evento Fantasma"),
          category: "EXPENSE",
          value: 100,
          frequency: "UNIQUE",
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /clients/:clientId/events", () => {
    it("should allow an ADVISOR to list all events for a specific client", async () => {
      const client = await createTestClient();
      await createTestEvent({ clientId: client.id });
      await createTestEvent({ clientId: client.id });
      await createTestEvent();

      const response = await request(app.server)
        .get(`/clients/${client.id}/events`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });

    it("should allow a VIEWER to list THEIR OWN events", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      await createTestEvent({ clientId: viewer.clientId! });
      await createTestEvent({ clientId: viewer.clientId! });
      await createTestEvent();

      const response = await request(app.server)
        .get(`/clients/${viewer.clientId}/events`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });

    it("should return 403 if a VIEWER tries to list events of ANOTHER client", async () => {
      const targetClient = await createTestClient();
      await createTestEvent({ clientId: targetClient.id });

      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .get(`/clients/${targetClient.id}/events`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /events/:eventId", () => {
    it("should allow an ADVISOR to get a specific event by its ID", async () => {
      const event = await createTestEvent();

      const response = await request(app.server)
        .get(`/events/${event.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("description");
      expect(response.body.id).toBe(event.id);
      expect(response.body.description).toBe(event.description);
    });

    it("should allow a VIEWER to get THEIR OWN specific event by ID", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);
      const event = await createTestEvent({ clientId: viewer.clientId! });

      const response = await request(app.server)
        .get(`/events/${event.id}`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body.id).toBe(event.id);
    });

    it("should return 403 if a VIEWER tries to get an event of ANOTHER client", async () => {
      const targetEvent = await createTestEvent();
      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .get(`/events/${targetEvent.id}`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 for a non-existent event ID", async () => {
      const nonExistentEventId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .get(`/events/${nonExistentEventId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("PUT /events/:eventId", () => {
    it("should allow an ADVISOR to update an event", async () => {
      const event = await createTestEvent({
        overrides: {
          descriptionPrefix: "Resgate para Viagem",
          category: "EXPENSE",
          value: 3000,
        },
      });

      const response = await request(app.server)
        .put(`/events/${event.id}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          value: 6000,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("description");
      expect(response.body).toHaveProperty("value");
      expect(response.body.description).toBe(event.description);
      expect(response.body.value).toBe("6000");
    });

    it("should return 403 if a VIEWER tries to update an event", async () => {
      const event = await createTestEvent({ overrides: { value: 3000 } });
      const { user, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(user.email, plainPassword);

      const response = await request(app.server)
        .put(`/events/${event.id}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ value: 6000 });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
      expect(response.body).not.toHaveProperty("description");
    });

    it("should return 404 when trying to update a non-existent event", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const response = await request(app.server)
        .put(`/events/${nonExistentId}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ description: "Descrição" });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("DELETE /events/:eventId", () => {
    it("should allow an ADVISOR to delete an event", async () => {
      const event = await createTestEvent();

      const response = await request(app.server)
        .delete(`/events/${event.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(204);

      const deletedEvent = await prisma.event.findUnique({
        where: { id: event.id },
      });
      expect(deletedEvent).toBeNull();
    });

    it("should return 404 when trying to delete a non-existent event", async () => {
      const nonExistentEventId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .delete(`/events/${nonExistentEventId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 403 if a VIEWER tries to delete an event", async () => {
      const event = await createTestEvent();
      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .delete(`/events/${event.id}`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");

      const stillExists = await prisma.event.findUnique({
        where: { id: event.id },
      });
      expect(stillExists).not.toBeNull();
    });
  });
});
