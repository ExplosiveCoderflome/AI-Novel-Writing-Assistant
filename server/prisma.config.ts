import { defineConfig } from "prisma/config";
import { getDatabaseUrl } from "./src/config/database";

export default defineConfig({
  schema: "src/prisma/schema.prisma",
  migrations: {
    seed: "ts-node-dev --transpile-only src/db/seed.ts",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
