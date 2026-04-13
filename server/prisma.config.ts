import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const configDir = path.dirname(fileURLToPath(import.meta.url));

function resolveDatabaseUrl(databaseUrl?: string) {
  const fallbackUrl = databaseUrl ?? "file:./dev.db";
  if (!fallbackUrl.startsWith("file:")) {
    return fallbackUrl;
  }

  const filePath = fallbackUrl.slice("file:".length) || "./dev.db";
  const resolvedFilePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(configDir, filePath);

  return `file:${resolvedFilePath}`;
}

export default defineConfig({
  schema: "src/prisma/schema.prisma",
  migrations: {
    seed: "ts-node-dev --transpile-only src/db/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrl(process.env.DATABASE_URL),
  },
});
