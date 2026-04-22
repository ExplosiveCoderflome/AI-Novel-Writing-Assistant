import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseFilePath } from "../runtime/appPaths";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function resolveDatabaseUrl(databaseUrl?: string): string {
  const fallbackUrl = databaseUrl ?? "file:./dev.db";
  if (!fallbackUrl.startsWith("file:")) {
    return fallbackUrl;
  }

  const filePath = fallbackUrl.slice("file:".length) || "./dev.db";
  const resolvedFilePath = path.isAbsolute(filePath) ? filePath : resolveDatabaseFilePath(filePath);
  fs.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });

  return `file:${resolvedFilePath}`;
}

function resolveSqliteBusyTimeout(timeoutValue?: string): number {
  const parsed = Number(timeoutValue);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 15000;
}

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);
const adapter = new PrismaBetterSqlite3({
  url: databaseUrl,
  timeout: resolveSqliteBusyTimeout(process.env.SQLITE_BUSY_TIMEOUT_MS),
});

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
