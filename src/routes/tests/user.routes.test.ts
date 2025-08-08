import request from "supertest";
import { app } from "../../server";
import { prisma } from "../../lib/prisma";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { loginAndGetToken } from "./utils/auth-helper";
import { createTestClient } from "./factories/client-factory";

describe("User Routes (CRUD)", () => {
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

  describe("POST /users", () => {
    it("should allow an ADVISOR to create a new VIEWER user", async () => {
      const client = await createTestClient();
      const response = await request(app.server)
        .post("/users")
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          email: client.email,
          password: "password123456",
          role: "VIEWER",
          clientId: client.id,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.email).toBe(client.email);
      expect(response.body).not.toHaveProperty("password");
    });

    it("should return 409 if email is already in use", async () => {
      const { user } = await createTestUser({
        role: "ADVISOR",
        emailPrefix: "duplicate",
      });
      const response = await request(app.server)
        .post("/users")
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({
          email: user.email,
          password: "password123",
          role: "ADVISOR",
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 403 if a VIEWER tries to create a user", async () => {
      const { user, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(user.email, plainPassword);

      const response = await request(app.server)
        .post("/users")
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          email: `another.user${TEST_EMAIL_SUFFIX}`,
          password: "password123",
          role: "ADVISOR",
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /users", () => {
    it("should allow an ADVISOR to list users with pagination", async () => {
      await createTestUser({ role: "VIEWER" });
      await createTestUser({ role: "VIEWER" });

      const response = await request(app.server)
        .get("/users?page=1&pageSize=5")
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("users");
      expect(response.body).toHaveProperty("meta");
      expect(response.body.users).toBeInstanceOf(Array);
    });

    it("should return 403 if a VIEWER tries to list users", async () => {
      const { user, plainPassword } = await createTestUser({ role: "VIEWER" });
      const viewerToken = await loginAndGetToken(user.email, plainPassword);

      const response = await request(app.server)
        .get("/users")
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET /users/:id and /me", () => {
    it("should allow an ADVISOR to get any user by ID", async () => {
      const { user } = await createTestUser({ role: "VIEWER" });

      const response = await request(app.server)
        .get(`/users/${user.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body.id).toBe(user.id);
    });

    it("should allow a user to get their own profile via /me", async () => {
      const { user, plainPassword } = await createTestUser({ role: "VIEWER" });
      const viewerToken = await loginAndGetToken(user.email, plainPassword);

      const response = await request(app.server)
        .get("/me")
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body.id).toBe(user.id);
    });

    it("should return 404 if an ADVISOR tries to get a user with a non-existent ID", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .get(`/users/${nonExistentId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  it("should return 403 if a VIEWER tries to get another user by ID", async () => {
    const { user: targetUser } = await createTestUser({ role: "VIEWER" });
    const { user: attackerUser, plainPassword } = await createTestUser({
      role: "VIEWER",
    });
    const attackerToken = await loginAndGetToken(
      attackerUser.email,
      plainPassword
    );

    const response = await request(app.server)
      .get(`/users/${targetUser.id}`)
      .set("Authorization", `Bearer ${attackerToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("message");
  });

  describe("PUT /users/:id", () => {
    it("should allow an ADVISOR to update a user", async () => {
      const { user } = await createTestUser({ role: "VIEWER" });

      const response = await request(app.server)
        .put(`/users/${user.id}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ role: "ADVISOR" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body.id).toBe(user.id);
      expect(response.body).toHaveProperty("role");
      expect(response.body.role).toBe("ADVISOR");
    });

    it("should NOT include a password hash in the update response body", async () => {
      const { user } = await createTestUser({ role: "VIEWER" });

      const response = await request(app.server)
        .put(`/users/${user.id}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ password: "newpassword" });

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty("password");
    });

    it("should return 403 if a VIEWER tries to update a user", async () => {
      const { user: viewerUser, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const { user: targetUser } = await createTestUser({ role: "VIEWER" });
      const viewerToken = await loginAndGetToken(
        viewerUser.email,
        plainPassword
      );

      const response = await request(app.server)
        .put(`/users/${targetUser.id}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ email: `hacked${TEST_EMAIL_SUFFIX}` });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 if a non-existent user ID is provided for update", async () => {
      const nonExistentId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .put(`/users/${nonExistentId}`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ password: "newpassword" });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("DELETE /users/:id", () => {
    it("should allow an ADVISOR to delete a user", async () => {
      const { user } = await createTestUser({ role: "VIEWER" });

      const response = await request(app.server)
        .delete(`/users/${user.id}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(204);

      const deletedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(deletedUser).toBeNull();
    });

    it("should return 400 if an ADVISOR tries to delete themselves", async () => {
      const advisorResponse = await request(app.server)
        .get("/me")
        .set("Authorization", `Bearer ${advisorToken}`);
      const advisorId = advisorResponse.body.id;

      const response = await request(app.server)
        .delete(`/users/${advisorId}`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message");
    });
  });

  it("should return 404 when trying to delete a non-existent user", async () => {
    const nonExistentId = "00000000-0000-0000-0000-000000000000";
    const response = await request(app.server)
      .delete(`/users/${nonExistentId}`)
      .set("Authorization", `Bearer ${advisorToken}`);

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty("message");
  });

  it("should return 403 if a VIEWER tries to delete a user", async () => {
    const { user: targetUser } = await createTestUser({ role: "VIEWER" });
    const { user: attackerUser, plainPassword } = await createTestUser({
      role: "VIEWER",
    });
    const attackerToken = await loginAndGetToken(
      attackerUser.email,
      plainPassword
    );
    const response = await request(app.server)
      .delete(`/users/${targetUser.id}`)
      .set("Authorization", `Bearer ${attackerToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty("message");

    const stillExists = await prisma.user.findUnique({
      where: { id: targetUser.id },
    });
    expect(stillExists).not.toBeNull();
  });
});
