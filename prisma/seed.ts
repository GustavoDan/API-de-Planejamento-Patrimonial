import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "..", ".env") });
const prisma = new PrismaClient();

async function main() {
  console.log("Start seeding...");

  const superUserEmail = process.env.SUPER_USER_EMAIL;
  const superUserPassword = process.env.SUPER_USER_PASSWORD;

  if (!superUserEmail || !superUserPassword) {
    throw new Error(
      "Please set SUPER_USER_EMAIL and SUPER_USER_PASSWORD in your .env file."
    );
  }

  const existingAdvisor = await prisma.user.findUnique({
    where: { email: superUserEmail },
  });

  if (existingAdvisor) {
    console.log("Advisor user already exists. Skipping...");
    return;
  }

  const hashedPassword = await bcrypt.hash(superUserPassword, 10);

  await prisma.user.create({
    data: {
      email: superUserEmail,
      password: hashedPassword,
      role: "ADVISOR",
    },
  });
  console.log(`Default advisor user (${superUserEmail}) created successfully.`);
}

console.log("Seeding finished.");

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
