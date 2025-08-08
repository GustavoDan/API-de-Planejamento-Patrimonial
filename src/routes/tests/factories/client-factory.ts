import { prisma } from "../../../lib/prisma";

interface CreateUserOptions {
  name?: string;
  dateOfBirth?: string;
  emailPrefix?: string;
}

export const TEST_EMAIL_SUFFIX = "123456789.test-email@test.dev";

export async function createTestClient(options?: CreateUserOptions) {
  const {
    name = "Cliente teste",
    emailPrefix,
    dateOfBirth = new Date("2000-01-01"),
  } = options || {};
  const email = `${name.toLowerCase().replace(" ", "")}.${
    emailPrefix || Date.now()
  }${TEST_EMAIL_SUFFIX}`;

  const client = await prisma.client.create({
    data: {
      name,
      email,
      dateOfBirth,
    },
  });

  return client;
}
