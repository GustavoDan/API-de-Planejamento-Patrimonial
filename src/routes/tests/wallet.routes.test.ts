import request from "supertest";
import { app } from "../../server";
import { prisma } from "../../lib/prisma";
import { createTestUser, TEST_EMAIL_SUFFIX } from "./factories/user-factory";
import { loginAndGetToken } from "./utils/auth-helper";
import { createTestClient } from "./factories/client-factory";
import { createTestWallet, TEST_ASSET_CLASS } from "./factories/wallet-factory";

describe("Wallet Routes", () => {
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

  describe("GET /clients/:clientId/wallet", () => {
    it("should allow an ADVISOR to get a client's wallet", async () => {
      const wallet = await createTestWallet();

      const response = await request(app.server)
        .get(`/clients/${wallet.clientId}/wallet`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("totalValue");
      expect(response.body.id).toBe(wallet.id);
      expect(response.body.totalValue).toBe(wallet.totalValue.toString());
    });

    it("should allow a VIEWER to get THEIR OWN wallet", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);
      const wallet = await createTestWallet({ clientId: viewer.clientId! });

      const response = await request(app.server)
        .get(`/clients/${viewer.clientId}/wallet`)
        .set("Authorization", `Bearer ${viewerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("id");
      expect(response.body.id).toBe(wallet.id);
    });

    it("should return 403 if a VIEWER tries to get ANOTHER client's wallet", async () => {
      const wallet = await createTestWallet();
      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .get(`/clients/${wallet.clientId}/wallet`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 if the client does not have a wallet", async () => {
      const client = await createTestClient();

      const response = await request(app.server)
        .get(`/clients/${client.id}/wallet`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("PUT /clients/:clientId/wallet", () => {
    it("should allow an ADVISOR to CREATE a wallet for a client", async () => {
      const client = await createTestClient();

      const response = await request(app.server)
        .put(`/clients/${client.id}/wallet`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ totalValue: 100000 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("totalValue");
      expect(response.body.totalValue).toBe("100000");
    });

    it("should allow an ADVISOR to UPDATE an existing wallet (returns 200)", async () => {
      const wallet = await createTestWallet({ totalValue: 50000 });

      const response = await request(app.server)
        .put(`/clients/${wallet.clientId}/wallet`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ totalValue: 150000 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("totalValue");
      expect(response.body.totalValue).toBe("150000");
    });

    it("should return 403 if a VIEWER tries to upsert a wallet", async () => {
      const { user: viewer, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const viewerToken = await loginAndGetToken(viewer.email, plainPassword);

      const response = await request(app.server)
        .put(`/clients/${viewer.clientId}/wallet`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ totalValue: 9999 });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 if the client ID does not exist", async () => {
      const nonExistentClientId = "00000000-0000-0000-0000-000000000000";
      const response = await request(app.server)
        .put(`/clients/${nonExistentClientId}/wallet`)
        .set("Authorization", `Bearer ${advisorToken}`)
        .send({ totalValue: 100 });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("DELETE /clients/:clientId", () => {
    it("should allow an ADVISOR to delete a client's wallet", async () => {
      const wallet = await createTestWallet();

      const response = await request(app.server)
        .delete(`/clients/${wallet.clientId}/wallet`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(204);

      const deletedWallet = await prisma.wallet.findUnique({
        where: { id: wallet.id },
      });
      expect(deletedWallet).toBeNull();
    });

    it("should return 404 when trying to delete a wallet that does not exist", async () => {
      const client = await createTestClient();
      const response = await request(app.server)
        .delete(`/clients/${client.id}/wallet`)
        .set("Authorization", `Bearer ${advisorToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 403 if a VIEWER tries to delete a wallet", async () => {
      const wallet = await createTestWallet();
      const { user: attacker, plainPassword } = await createTestUser({
        role: "VIEWER",
      });
      const attackerToken = await loginAndGetToken(
        attacker.email,
        plainPassword
      );

      const response = await request(app.server)
        .delete(`/clients/${wallet.clientId}/wallet`)
        .set("Authorization", `Bearer ${attackerToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty("message");

      const stillExists = await prisma.wallet.findUnique({
        where: { id: wallet.id },
      });
      expect(stillExists).not.toBeNull();
    });
  });
});
