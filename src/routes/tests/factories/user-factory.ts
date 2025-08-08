import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { BCRYPT_SALT_ROUNDS } from "../../../config/constants";

interface CreateUserOptions {
  role: "ADVISOR" | "VIEWER";
  emailPrefix?: string;
  password?: string;
}

export const TEST_EMAIL_SUFFIX = "123456789.test-email@test.dev";

export async function createTestUser(options: CreateUserOptions) {
  const { role, emailPrefix, password } = options;
  const email = `${role.toLowerCase()}.${
    emailPrefix || Date.now()
  }${TEST_EMAIL_SUFFIX}`;

  const defaultPassword = "default_password_123";
  const hashedPassword = await bcrypt.hash(
    password || defaultPassword,
    BCRYPT_SALT_ROUNDS
  );

  let clientId: string | undefined = undefined;

  if (role === "VIEWER") {
    const client = await prisma.client.create({
      data: {
        name: `Cliente de Teste para ${email}`,
        email,
        dateOfBirth: new Date("1990-01-01"),
      },
    });
    clientId = client.id;
  }

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role,
      clientId,
    },
  });

  return {
    user,
    plainPassword: password || defaultPassword,
  };
}
