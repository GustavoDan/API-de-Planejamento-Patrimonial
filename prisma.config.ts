import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config();

export default defineConfig({
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
