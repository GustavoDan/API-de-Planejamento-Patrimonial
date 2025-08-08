import request from "supertest";
import { app } from "../../../server";

export async function loginAndGetToken(email: string, password: string) {
  const response = await request(app.server).post("/sessions").send({
    email,
    password,
  });

  return response.body.token;
}
