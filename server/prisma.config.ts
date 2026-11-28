import { defineConfig } from "prisma/config";
import { resolveDatabaseRuntimeConfig } from "./src/config/database";

const runtimeConfig = resolveDatabaseRuntimeConfig();

export default defineConfig({
  schema: runtimeConfig.prismaSchemaPath,
  migrations: {
    path: runtimeConfig.prismaMigrationsPath,
    seed: "tsx src/db/seed.ts",
  },
  datasource: {
    url: runtimeConfig.url,
  },
});
