import request from "supertest";
import { app } from "../../server";
import { prisma } from "../../lib/prisma";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { loginAndGetToken } from "./utils/auth-helper";
import { createTestClient } from "./factories/client-factory";
import {
  createTestGoal,
  getTestGoalDescription,
  TEST_GOAL_DESCRIPTION_SUFFIX,
} from "./factories/goal-factory";

describe("Goal Routes (CRUD)", () => {
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

  afterAll(async () => {
    await app.close();
  });

  describe("POST /clients/:clientId/goals", () => {
    it("should allow an ADVISOR to create a new goal for a client", async () => {
      const client = await createTestClient();
      const description = getTestGoalDescription("Aposentadoria");
      const goalPayload = {
        description,
        targetValue: 1500000,
        targetDate: "2050-12-31",
      };

      const response = await request(app.server)
        .post(`/clients/${client.id}/goals`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send(goalPayload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.description).toBe(description);
      expect(response.body.clientId).toBe(client.id);
    });

    it("should return 403 if a VIEWER tries to create a new goal for a client", async () => {
      const client = await createTestClient();
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      const response = await request(app.server)
        .post(`/clients/${client.id}/goals`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          description: getTestGoalDescription("Meta Proibida"),
          targetValue: 1500000,
          targetDate: "2050-12-31",
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 if the client ID does not exist", async () => {
      const nonExistentClientId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .post(`/clients/${nonExistentClientId}/goals`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          description: getTestGoalDescription("Meta Fantasma"),
          targetValue: 500,
          targetDate: new Date(),
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /clients/:clientId/goals", () => {
    it("should allow an ADVISOR to list all goals for a specific client", async () => {
      const client = await createTestClient();

      await createTestGoal({ clientId: client.id });
      await createTestGoal({ clientId: client.id });
      await createTestGoal();

      const response = await request(app.server)
        .get(`/clients/${client.id}/goals`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.goals).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });

    it("should allow a VIEWER to list THEIR OWN goals", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      await createTestGoal({ clientId: viewer.clientId! });
      await createTestGoal({ clientId: viewer.clientId! });
      await createTestGoal();

      const response = await request(app.server)
        .get(`/clients/${viewer.clientId}/goals`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.goals).toHaveLength(2);
      expect(response.body.meta.total).toBe(2);
    });

    it("should return 403 if a VIEWER tries to list goals of ANOTHER client", async () => {
      const targetClient = await createTestClient();
      await createTestGoal({ clientId: targetClient.id });

      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .get(`/clients/${targetClient.id}/goals`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /goals/:goalId", () => {
    it("should allow an ADVISOR to get any specific goal by its ID", async () => {
      const goal = await createTestGoal();

      const response = await request(app.server)
        .get(`/goals/${goal.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("description");
      expect(response.body.id).toBe(goal.id);
      expect(response.body.description).toBe(goal.description);
    });

    it("should allow a VIEWER to get THEIR OWN specific goal by ID", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      const myGoal = await createTestGoal({ clientId: viewer.clientId! });

      const response = await request(app.server)
        .get(`/goals/${myGoal.id}`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body.id).toBe(myGoal.id);
    });

    it("should return 403 if a VIEWER tries to get a goal of ANOTHER client", async () => {
      const targetGoal = await createTestGoal();

      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .get(`/goals/${targetGoal.id}`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 for a non-existent goal ID", async () => {
      const nonExistentGoalId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .get(`/goals/${nonExistentGoalId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("PUT /goals/:goalId", () => {
    it("should allow an ADVISOR to update a goal", async () => {
      const goal = await createTestGoal();
      const description = getTestGoalDescription("Meta de Viagem Atualizada");

      const response = await request(app.server)
        .put(`/goals/${goal.id}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          description,
          targetValue: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("description");
      expect(response.body).toHaveProperty("targetValue");
      expect(response.body.description).toBe(description);
      expect(response.body.targetValue).toBe("1");
    });

    it("should return 403 if a VIEWER tries to update a goal", async () => {
      const goal = await createTestGoal();
      const { user, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(user.email, plainPassword);
      const description = getTestGoalDescription("Outra descrição");

      const response = await request(app.server)
        .put(`/goals/${goal.id}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ description });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
      expect(response.body).not.toHaveProperty("description");
      expect(response.body.description).not.toBe(description);
    });

    it("should return 404 when trying to update a non-existent goal", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";

      const response = await request(app.server)
        .put(`/goals/${nonExistentId}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ description: "Descrição" });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("DELETE /goals/:goalId", () => {
    it("should allow an ADVISOR to delete a goal", async () => {
      const goal = await createTestGoal();

      const response = await request(app.server)
        .delete(`/goals/${goal.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(204);

      const deletedGoal = await prisma.goal.findUnique({
        where: { id: goal.id },
      });
      expect(deletedGoal).toBeNull();
    });

    it("should return 404 when trying to delete a non-existent goal", async () => {
      const nonExistentGoalId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .delete(`/goals/${nonExistentGoalId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 403 if a VIEWER tries to delete a goal", async () => {
      const goal = await createTestGoal();
      const { user, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(user.email, plainPassword);

      const response = await request(app.server)
        .delete(`/goals/${goal.id}`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");

      const stillExists = await prisma.goal.findUnique({
        where: { id: goal.id },
      });
      expect(stillExists).not.toBeNull();
    });
  });
});
