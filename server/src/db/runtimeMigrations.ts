import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  resolveAppRuntimeMode,
  resolveDatabaseFilePath,
  resolveServerRoot,
} from "../runtime/appPaths";

const KNOWN_APPLICATION_TABLES = [
  "Novel",
  "APIKey",
  "AppSetting",
  "KnowledgeDocument",
];

const REQUIRED_COLUMN_BACKFILLS = [
  { tableName: "Character", columnName: "arcClimax", columnDefinition: `"arcClimax" TEXT` },
  { tableName: "Character", columnName: "arcEnd", columnDefinition: `"arcEnd" TEXT` },
  { tableName: "Character", columnName: "arcMidpoint", columnDefinition: `"arcMidpoint" TEXT` },
  { tableName: "Character", columnName: "arcStart", columnDefinition: `"arcStart" TEXT` },
  { tableName: "Character", columnName: "castRole", columnDefinition: `"castRole" TEXT` },
  { tableName: "Character", columnName: "fear", columnDefinition: `"fear" TEXT` },
  { tableName: "Character", columnName: "firstImpression", columnDefinition: `"firstImpression" TEXT` },
  { tableName: "Character", columnName: "innerNeed", columnDefinition: `"innerNeed" TEXT` },
  { tableName: "Character", columnName: "misbelief", columnDefinition: `"misbelief" TEXT` },
  { tableName: "Character", columnName: "moralLine", columnDefinition: `"moralLine" TEXT` },
  { tableName: "Character", columnName: "outerGoal", columnDefinition: `"outerGoal" TEXT` },
  { tableName: "Character", columnName: "relationToProtagonist", columnDefinition: `"relationToProtagonist" TEXT` },
  { tableName: "Character", columnName: "secret", columnDefinition: `"secret" TEXT` },
  { tableName: "Character", columnName: "storyFunction", columnDefinition: `"storyFunction" TEXT` },
  { tableName: "Character", columnName: "wound", columnDefinition: `"wound" TEXT` },
  {
    tableName: "BookAnalysis",
    columnName: "pendingManualRecovery",
    columnDefinition: `"pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false`,
  },
  {
    tableName: "GenerationJob",
    columnName: "pendingManualRecovery",
    columnDefinition: `"pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false`,
  },
  {
    tableName: "ImageGenerationTask",
    columnName: "pendingManualRecovery",
    columnDefinition: `"pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false`,
  },
  {
    tableName: "StyleProfile",
    columnName: "extractionPresetsJson",
    columnDefinition: `"extractionPresetsJson" TEXT`,
  },
  {
    tableName: "StyleProfile",
    columnName: "extractionAntiAiRuleKeysJson",
    columnDefinition: `"extractionAntiAiRuleKeysJson" TEXT`,
  },
  {
    tableName: "StyleProfile",
    columnName: "selectedExtractionPresetKey",
    columnDefinition: `"selectedExtractionPresetKey" TEXT`,
  },
] as const;

function resolveSqliteDatabasePath(): string | null {
  const databaseUrl = process.env.DATABASE_URL?.trim() || "file:./dev.db";
  if (!databaseUrl.startsWith("file:")) {
    return null;
  }

  const filePath = databaseUrl.slice("file:".length) || "./dev.db";
  return path.isAbsolute(filePath) ? filePath : resolveDatabaseFilePath(filePath);
}

function resolveMigrationsDir(): string {
  return path.join(resolveServerRoot(), "src", "prisma", "migrations");
}

function createMigrationsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);
}

function tableExists(database: Database.Database, tableName: string): boolean {
  const result = database
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName);
  return result != null;
}

function columnExists(database: Database.Database, tableName: string, columnName: string): boolean {
  if (!tableExists(database, tableName)) {
    return false;
  }

  const columns = database.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
    name?: string;
  }>;

  return columns.some((column) => column.name === columnName);
}

function listMigrationNames(migrationsDir: string): string[] {
  return fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function hasLegacyApplicationTables(database: Database.Database): boolean {
  return KNOWN_APPLICATION_TABLES.some((tableName) => tableExists(database, tableName));
}

function isMigrationRecorded(database: Database.Database, migrationName: string): boolean {
  const result = database
    .prepare(
      `SELECT id
       FROM "_prisma_migrations"
       WHERE migration_name = ?
         AND rolled_back_at IS NULL
         AND finished_at IS NOT NULL
       LIMIT 1`,
    )
    .get(migrationName);
  return result != null;
}

function recordAppliedMigration(database: Database.Database, migrationName: string, checksum: string): void {
  database.prepare(
    `INSERT INTO "_prisma_migrations" (
      id,
      checksum,
      finished_at,
      migration_name,
      started_at,
      applied_steps_count
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    checksum,
    new Date().toISOString(),
    migrationName,
    new Date().toISOString(),
    1,
  );
}

function applyMigration(database: Database.Database, migrationsDir: string, migrationName: string): void {
  const migrationFilePath = path.join(migrationsDir, migrationName, "migration.sql");
  const migrationSql = fs.readFileSync(migrationFilePath, "utf8");
  const checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");
  const migrationId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  database.prepare(
    `INSERT INTO "_prisma_migrations" (
      id,
      checksum,
      migration_name,
      started_at,
      applied_steps_count
    ) VALUES (?, ?, ?, ?, 0)`,
  ).run(migrationId, checksum, migrationName, startedAt);

  try {
    database.exec("BEGIN");
    database.exec(migrationSql);
    database.prepare(
      `UPDATE "_prisma_migrations"
       SET finished_at = ?, applied_steps_count = 1
       WHERE id = ?`,
    ).run(new Date().toISOString(), migrationId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    database.prepare(
      `UPDATE "_prisma_migrations"
       SET logs = ?
       WHERE id = ?`,
    ).run(error instanceof Error ? error.stack || error.message : String(error), migrationId);
    throw error;
  }
}

function ensureSchemaColumnBackfills(database: Database.Database): void {
  for (const backfill of REQUIRED_COLUMN_BACKFILLS) {
    if (columnExists(database, backfill.tableName, backfill.columnName)) {
      continue;
    }

    database.exec(`ALTER TABLE "${backfill.tableName}" ADD COLUMN ${backfill.columnDefinition};`);
  }
}

export async function ensureRuntimeDatabaseReady(): Promise<void> {
  if (resolveAppRuntimeMode() !== "desktop") {
    return;
  }

  const databasePath = resolveSqliteDatabasePath();
  if (!databasePath) {
    return;
  }

  const migrationsDir = resolveMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Desktop runtime migrations were not found at ${migrationsDir}.`);
  }

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);

  try {
    const hasMigrationTable = tableExists(database, "_prisma_migrations");
    const hasLegacyTables = hasLegacyApplicationTables(database);

    createMigrationsTable(database);

    if (!hasMigrationTable && hasLegacyTables) {
      for (const migrationName of listMigrationNames(migrationsDir)) {
        const migrationFilePath = path.join(migrationsDir, migrationName, "migration.sql");
        const migrationSql = fs.readFileSync(migrationFilePath, "utf8");
        const checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");
        if (!isMigrationRecorded(database, migrationName)) {
          recordAppliedMigration(database, migrationName, checksum);
        }
      }
      ensureSchemaColumnBackfills(database);
      return;
    }

    for (const migrationName of listMigrationNames(migrationsDir)) {
      if (isMigrationRecorded(database, migrationName)) {
        continue;
      }
      applyMigration(database, migrationsDir, migrationName);
    }

    ensureSchemaColumnBackfills(database);
  } finally {
    database.close();
  }
}
