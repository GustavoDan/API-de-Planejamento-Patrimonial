import { Prisma, PrismaClient } from "@prisma/client";
import { fakerPT_BR as faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { resolve } from "path";
import { BCRYPT_SALT_ROUNDS } from "../src/config/constants";

config({ path: resolve(__dirname, "..", ".env") });

const prisma = new PrismaClient();

function generateAssetClasses(): { className: string; percentage: number }[] {
  const classes = [
    "Ações Nacionais",
    "Ações Internacionais",
    "Renda Fixa",
    "Fundos Imobiliários",
  ];
  let remaining = 100;
  const allocation = [];

  for (let i = 0; i < classes.length - 1; i++) {
    const percentage = faker.number.int({
      min: 10,
      max: Math.max(10, remaining - 10 * (classes.length - 1 - i)),
    });
    allocation.push({ className: classes[i], percentage });
    remaining -= percentage;
  }
  allocation.push({
    className: classes[classes.length - 1],
    percentage: remaining,
  });

  return allocation;
}
async function main() {
  console.log("🌱 Starting database seeding...");

  console.log("🔥 Deleting existing data...");
  await prisma.simulation.deleteMany();
  await prisma.insurance.deleteMany();
  await prisma.event.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();

  console.log("👤 Creating default ADVISOR user...");
  const superUserEmail = process.env.SUPER_USER_EMAIL;
  const superUserPassword = process.env.SUPER_USER_PASSWORD;

  if (!superUserEmail || !superUserPassword) {
    throw new Error(
      "SUPER_USER_EMAIL and SUPER_USER_PASSWORD must be set in .env"
    );
  }

  const hashedPassword = await bcrypt.hash(
    superUserPassword,
    BCRYPT_SALT_ROUNDS
  );
  await prisma.user.create({
    data: {
      email: superUserEmail,
      password: hashedPassword,
      role: "ADVISOR",
    },
  });
  console.log("✅ Default ADVISOR user created.");

  const CLIENT_COUNT = 150;
  console.log(`✨ Seeding ${CLIENT_COUNT} random clients...`);

  for (let i = 0; i < CLIENT_COUNT; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const clientEmail = faker.internet
      .email({ firstName: `${firstName}.${i}`, lastName })
      .toLowerCase();

    const hasWalletAndGoals = Math.random() <= 0.7;
    const hasInsurance = Math.random() <= 0.6;
    const hasSimulations = Math.random() <= 0.5;

    await prisma.client.create({
      data: {
        name: `${firstName} ${lastName}`,
        email: clientEmail,
        dateOfBirth: faker.date.birthdate({ min: 18, max: 70, mode: "age" }),
        isActive: true,
        familyProfile:
          Math.random() > 0.3
            ? [
                {
                  relationship: "CHILD",
                  name: faker.person.firstName(),
                  dateOfBirth: faker.date.birthdate({
                    min: 1,
                    max: 15,
                    mode: "age",
                  }),
                },
              ]
            : [],

        user: {
          create: {
            email: clientEmail,
            password: await bcrypt.hash("password123", BCRYPT_SALT_ROUNDS),
            role: "VIEWER",
          },
        },

        ...(hasWalletAndGoals && {
          wallet: {
            create: {
              totalValue: faker.finance.amount({
                min: 5000,
                max: 2000000,
                dec: 2,
              }),
              assetClasses: (Math.random() > 0.1
                ? generateAssetClasses()
                : []) as Prisma.InputJsonValue,
            },
          },

          goals: {
            create: Array.from({
              length: faker.number.int({ min: 1, max: 5 }),
            }).map(() => ({
              description: faker.lorem.words({ min: 2, max: 4 }),
              targetValue: faker.finance.amount({
                min: 10000,
                max: 1000000,
                dec: 2,
              }),
              targetDate: faker.date.future({ years: 10 }),
            })),
          },
        }),

        events: {
          create: Array.from({
            length: faker.number.int({ min: 2, max: 8 }),
          }).map(() => ({
            description: faker.finance.transactionDescription(),
            category: faker.helpers.arrayElement(["INCOME", "EXPENSE"]),
            value: faker.finance.amount({ min: 100, max: 5000, dec: 2 }),
            frequency: faker.helpers.arrayElement([
              "UNIQUE",
              "MONTHLY",
              "ANNUAL",
            ]),
          })),
        },

        ...(hasInsurance && {
          insurances: {
            create: Array.from({
              length: faker.number.int({ min: 1, max: 2 }),
            }).map(() => ({
              type: faker.helpers.arrayElement(["LIFE", "DISABILITY"]),
              coverageValue: faker.finance.amount({
                min: 100000,
                max: 3000000,
                dec: 2,
              }),
            })),
          },
        }),

        ...(hasSimulations && {
          simulations: {
            create: Array.from({
              length: faker.number.int({ min: 1, max: 3 }),
            }).map(() => {
              const annualRate = faker.number.float({
                min: 2,
                max: 8,
                multipleOf: 0.5,
              });
              let startValue = faker.number.float({ min: 50000, max: 500000 });
              const projectionData = [];
              for (let year = new Date().getFullYear(); year <= 2060; year++) {
                startValue *= 1 + annualRate / 100;
                projectionData.push({
                  year,
                  projectedValue: startValue.toFixed(2),
                });
              }

              return {
                projection: projectionData as Prisma.InputJsonValue,
                rate: annualRate,
                endYear: 2060,
              };
            }),
          },
        }),
      },
    });
    process.stdout.write(`\r✅ Client ${i + 1}/${CLIENT_COUNT} seeded.`);
  }

  console.log("\n\nSeeding finished successfully! 🌱");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
