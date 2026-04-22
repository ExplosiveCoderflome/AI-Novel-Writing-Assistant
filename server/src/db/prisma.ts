import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "../config/database";
import { resolveDatabaseFilePath } from "../runtime/appPaths";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function resolveSqliteDatabaseUrl(databaseUrl: string): string {
  const filePath = databaseUrl.slice("file:".length) || "./dev.db";
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

const databaseUrl = getDatabaseUrl();
const adapter = databaseUrl.startsWith("file:")
  ? new PrismaBetterSqlite3({
      url: resolveSqliteDatabaseUrl(databaseUrl),
      timeout: resolveSqliteBusyTimeout(process.env.SQLITE_BUSY_TIMEOUT_MS),
    })
  : new PrismaPg({
      connectionString: databaseUrl,
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
