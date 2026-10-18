import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "../config/database";
import { resolveDatabaseFilePath } from "../runtime/appPaths";
import { configureSqliteRuntimePragmas } from "./sqlitePragmas";
import {assertExecutionActive} from "../platform/runtime/execution";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function resolveSqliteDatabasePath(databaseUrl: string): string {
  const filePath = databaseUrl.slice("file:".length) || "./dev.db";
  return path.isAbsolute(filePath) ? filePath : resolveDatabaseFilePath(filePath);
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
  ? (() => {
      const timeout = resolveSqliteBusyTimeout(process.env.SQLITE_BUSY_TIMEOUT_MS);
      const sqlitePath = resolveSqliteDatabasePath(databaseUrl);
      fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
      configureSqliteRuntimePragmas(sqlitePath, {
        busyTimeoutMs: timeout,
      });
      return new PrismaBetterSqlite3({
        url: `file:${sqlitePath}`,
        timeout,
      });
    })()
  : new PrismaPg({
      connectionString: databaseUrl,
    });

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  }).$extends({query: {$allOperations({model, args, query}) {
    // Usage is an observed billing fact even when the execution lost authority.
    if (model !== "LlmInvocationUsageRecord") assertExecutionActive();
    return query(args);
  }}}) as PrismaClient;

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
