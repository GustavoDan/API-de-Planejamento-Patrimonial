import request from "supertest";
import { app } from "../../server";
import { prisma } from "../../lib/prisma";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { AuthenticatedUser } from "../../hooks/auth";

describe("Session Routes (POST /sessions)", () => {
  beforeAll(async () => {
    await app.ready();
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

  it("should be able to authenticate with valid credentials", async () => {
    const { user, plainPassword } = await createTestUser({ role: "VIEWER" });

    const response = await request(app.server).post("/sessions").send({
      email: user.email,
      password: plainPassword,
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
    expect(typeof response.body.token).toBe("string");
  });

  it("should be able to authenticate and return a JWT with correct payload", async () => {
    const { user, plainPassword } = await createTestUser({ role: "VIEWER" });

    const response = await request(app.server).post("/sessions").send({
      email: user.email,
      password: plainPassword,
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty("token");

    const decodedToken = app.jwt.verify<AuthenticatedUser>(response.body.token);

    expect(decodedToken.sub).toBe(user.id);
    expect(decodedToken.role).toBe(user.role);
    expect(decodedToken.clientId).toBe(user.clientId);
    expect(decodedToken.iat).toBeDefined();
    expect(decodedToken.exp).toBeDefined();
  });

  it("should not be able to authenticate with wrong password", async () => {
    const { user } = await createTestUser({ role: "VIEWER" });

    const response = await request(app.server)
      .post("/sessions")
      .send({
        email: user.email,
        password: `wrongpassword${Date.now()}`,
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message");
    expect(response.body.message).toBe("Credenciais inválidas.");
  });

  it("should not be able to authenticate with non-existing user", async () => {
    const response = await request(app.server)
      .post("/sessions")
      .send({
        email: `593y2yh9efnjl3ferw2b4${Date.now()}@example.com`,
        password: "anypassword",
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty("message");
    expect(response.body.message).toBe("Credenciais inválidas.");
  });

  it("should return 400 when body is invalid", async () => {
    const response = await request(app.server)
      .post("/sessions")
      .send({ email: "invalid-email", password: "" });

    expect(response.statusCode).toBe(400);
    expect(response.body).toHaveProperty("message");
  });
});
