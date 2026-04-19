import fs from "node:fs";
import path from "node:path";
import { appendDesktopLog, logDesktopError } from "./logging";
import { resolveDesktopAppDataDir, resolveWorkspaceRoot } from "./paths";

const IMPORT_ARG_PREFIX = "--ai-novel-import-db=";
const SQLITE_HEADER = Buffer.from("SQLite format 3\u0000", "utf8");
const DESKTOP_DATABASE_FILE_NAME = "dev.db";
const DATABASE_SIDE_CAR_SUFFIXES = ["", "-wal", "-shm"] as const;
const KNOWN_APPLICATION_TABLES = ["Novel", "APIKey", "AppSetting", "KnowledgeDocument"] as const;
const MEANINGFUL_DATA_TABLES = ["Novel", "APIKey", "KnowledgeDocument"] as const;

type DatabaseRow = Record<string, unknown>;

interface SqliteStatement {
  get(...params: unknown[]): DatabaseRow | undefined;
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

type SqliteDatabaseConstructor = new (
  filePath: string,
  options?: {
    readonly?: boolean;
    fileMustExist?: boolean;
  },
) => SqliteDatabase;

const BetterSqlite3 = require("better-sqlite3") as SqliteDatabaseConstructor;

export interface DesktopDataImportSnapshot {
  currentDatabasePath: string;
  currentDatabaseLikelyFresh: boolean;
  suggestedSourcePath: string | null;
  suggestedSourceLabel: string | null;
  backupDirectory: string;
}

export interface DesktopDataImportResult {
  importedFrom: string;
  importedTo: string;
  backupDirectory: string | null;
}

interface LegacyDatabaseCandidate {
  path: string;
  label: string;
}

interface DatabaseBundleBackup {
  backupDirectory: string;
  hadPrimaryFile: boolean;
}

function resolveDesktopDatabasePath(): string {
  return path.join(resolveDesktopAppDataDir(), "data", DESKTOP_DATABASE_FILE_NAME);
}

function resolveDesktopDatabaseBackupRoot(): string {
  return path.join(resolveDesktopAppDataDir(), "backups", "database-imports");
}

function normalizeImportPath(value: string): string {
  return path.resolve(value.trim());
}

function getDatabaseBundlePaths(databasePath: string): string[] {
  return DATABASE_SIDE_CAR_SUFFIXES.map((suffix) => `${databasePath}${suffix}`);
}

function hasAnyDatabaseBundleFile(databasePath: string): boolean {
  return getDatabaseBundlePaths(databasePath).some((targetPath) => fs.existsSync(targetPath));
}

function ensureSqliteHeader(filePath: string): boolean {
  try {
    const fileHandle = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(SQLITE_HEADER.length);
      const bytesRead = fs.readSync(fileHandle, header, 0, header.length, 0);
      return bytesRead === SQLITE_HEADER.length && header.equals(SQLITE_HEADER);
    } finally {
      fs.closeSync(fileHandle);
    }
  } catch {
    return false;
  }
}

function openReadonlyDatabase(filePath: string): SqliteDatabase | null {
  try {
    return new BetterSqlite3(filePath, { readonly: true, fileMustExist: true });
  } catch (error) {
    logDesktopError("desktop.data-import.db-open", error);
    return null;
  }
}

function tableExists(database: SqliteDatabase, tableName: string): boolean {
  const row = database.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName);
  return row != null;
}

function countRows(database: SqliteDatabase, tableName: string): number {
  if (!tableExists(database, tableName)) {
    return 0;
  }

  const row = database.prepare(`SELECT COUNT(*) AS count FROM "${tableName}"`).get();
  const count = Number(row?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function hasKnownApplicationTables(filePath: string): boolean {
  if (!fs.existsSync(filePath) || !ensureSqliteHeader(filePath)) {
    return false;
  }

  const database = openReadonlyDatabase(filePath);
  if (!database) {
    return false;
  }

  try {
    return KNOWN_APPLICATION_TABLES.some((tableName) => tableExists(database, tableName));
  } finally {
    database.close();
  }
}

function isDatabaseLikelyFresh(filePath: string): boolean {
  if (!fs.existsSync(filePath) || !ensureSqliteHeader(filePath)) {
    return true;
  }

  const database = openReadonlyDatabase(filePath);
  if (!database) {
    return true;
  }

  try {
    const meaningfulRowCount = MEANINGFUL_DATA_TABLES
      .map((tableName) => countRows(database, tableName))
      .reduce((sum, count) => sum + count, 0);
    return meaningfulRowCount === 0;
  } finally {
    database.close();
  }
}

function addAncestorRoots(target: Map<string, string>, startPath: string, label: string, maxDepth = 8): void {
  let currentPath = path.resolve(startPath);

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    if (!target.has(currentPath)) {
      target.set(currentPath, label);
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }
}

function collectLegacyDatabaseCandidates(currentDatabasePath: string): LegacyDatabaseCandidate[] {
  const normalizedCurrentDatabasePath = normalizeImportPath(currentDatabasePath);
  const candidates = new Map<string, string>();

  const envCandidate = process.env.AI_NOVEL_LEGACY_WEB_DB_PATH?.trim();
  if (envCandidate) {
    candidates.set(normalizeImportPath(envCandidate), "Configured by AI_NOVEL_LEGACY_WEB_DB_PATH");
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const workspaceServerDatabase = path.join(workspaceRoot, "server", DESKTOP_DATABASE_FILE_NAME);
  candidates.set(normalizeImportPath(workspaceServerDatabase), "Detected from the current workspace");

  const rootHints = new Map<string, string>();
  addAncestorRoots(rootHints, workspaceRoot, "Detected from the current workspace");
  addAncestorRoots(rootHints, process.cwd(), "Detected from the current working directory");
  addAncestorRoots(rootHints, path.dirname(process.execPath), "Detected near the desktop executable");

  for (const [rootPath, label] of rootHints.entries()) {
    const candidatePath = normalizeImportPath(path.join(rootPath, "server", DESKTOP_DATABASE_FILE_NAME));
    if (!candidates.has(candidatePath)) {
      candidates.set(candidatePath, label);
    }
  }

  return Array.from(candidates.entries())
    .map(([candidatePath, label]) => ({
      path: candidatePath,
      label,
    }))
    .filter((candidate) => candidate.path !== normalizedCurrentDatabasePath)
    .filter((candidate) => fs.existsSync(candidate.path))
    .filter((candidate) => hasKnownApplicationTables(candidate.path));
}

export function getDesktopDataImportSnapshot(): DesktopDataImportSnapshot {
  const currentDatabasePath = resolveDesktopDatabasePath();
  const [suggestedCandidate] = collectLegacyDatabaseCandidates(currentDatabasePath);

  return {
    currentDatabasePath,
    currentDatabaseLikelyFresh: isDatabaseLikelyFresh(currentDatabasePath),
    suggestedSourcePath: suggestedCandidate?.path ?? null,
    suggestedSourceLabel: suggestedCandidate?.label ?? null,
    backupDirectory: resolveDesktopDatabaseBackupRoot(),
  };
}

export function extractPendingDatabaseImportPath(argv: string[] = process.argv): string | null {
  const pendingArg = argv.find((argument) => argument.startsWith(IMPORT_ARG_PREFIX));
  if (!pendingArg) {
    return null;
  }

  const rawPath = pendingArg.slice(IMPORT_ARG_PREFIX.length).trim();
  return rawPath ? normalizeImportPath(rawPath) : null;
}

export function createDatabaseImportRelaunchArgs(sourcePath: string, argv: string[] = process.argv): string[] {
  const sanitizedArgs = argv
    .slice(1)
    .filter((argument) => !argument.startsWith(IMPORT_ARG_PREFIX));
  return [...sanitizedArgs, `${IMPORT_ARG_PREFIX}${normalizeImportPath(sourcePath)}`];
}

export function createSanitizedRelaunchArgs(argv: string[] = process.argv): string[] {
  return argv
    .slice(1)
    .filter((argument) => !argument.startsWith(IMPORT_ARG_PREFIX));
}

function createBackupDirectoryName(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `desktop-db-before-import-${timestamp}`;
}

function removeDatabaseBundle(databasePath: string): void {
  for (const targetPath of getDatabaseBundlePaths(databasePath)) {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
    }
  }
}

function copyDatabaseBundle(sourcePath: string, targetPath: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  removeDatabaseBundle(targetPath);

  for (const suffix of DATABASE_SIDE_CAR_SUFFIXES) {
    const fromPath = `${sourcePath}${suffix}`;
    const toPath = `${targetPath}${suffix}`;
    if (fs.existsSync(fromPath)) {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

function backupDatabaseBundle(databasePath: string): DatabaseBundleBackup | null {
  if (!hasAnyDatabaseBundleFile(databasePath)) {
    return null;
  }

  const backupRoot = resolveDesktopDatabaseBackupRoot();
  const backupDirectory = path.join(backupRoot, createBackupDirectoryName());
  fs.mkdirSync(backupDirectory, { recursive: true });

  for (const suffix of DATABASE_SIDE_CAR_SUFFIXES) {
    const sourcePath = `${databasePath}${suffix}`;
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    const targetPath = path.join(backupDirectory, `${DESKTOP_DATABASE_FILE_NAME}${suffix}`);
    fs.copyFileSync(sourcePath, targetPath);
  }

  const primarySourcePath = databasePath;
  const primaryBackupPath = path.join(backupDirectory, DESKTOP_DATABASE_FILE_NAME);
  const hadPrimaryFile = fs.existsSync(primarySourcePath);

  if (hadPrimaryFile) {
    const sourceSize = fs.statSync(primarySourcePath).size;
    const backupSize = fs.existsSync(primaryBackupPath) ? fs.statSync(primaryBackupPath).size : -1;
    if (sourceSize !== backupSize) {
      throw new Error(`Desktop database backup verification failed at ${primaryBackupPath}.`);
    }
  }

  return {
    backupDirectory,
    hadPrimaryFile,
  };
}

function restoreDatabaseBundle(backupDirectory: string, databasePath: string): void {
  const backupDatabasePath = path.join(backupDirectory, DESKTOP_DATABASE_FILE_NAME);
  if (!hasAnyDatabaseBundleFile(backupDatabasePath)) {
    removeDatabaseBundle(databasePath);
    return;
  }

  copyDatabaseBundle(backupDatabasePath, databasePath);
}

function validateImportSource(sourcePath: string, currentDatabasePath: string): string {
  if (!sourcePath.trim()) {
    throw new Error("Please choose the old web database file first.");
  }

  const normalizedSourcePath = normalizeImportPath(sourcePath);
  const normalizedCurrentPath = normalizeImportPath(currentDatabasePath);

  if (normalizedSourcePath === normalizedCurrentPath) {
    throw new Error("The selected database is already the current desktop database.");
  }

  if (!fs.existsSync(normalizedSourcePath)) {
    throw new Error(`The selected database file does not exist: ${normalizedSourcePath}`);
  }

  if (!ensureSqliteHeader(normalizedSourcePath)) {
    throw new Error("The selected file is not a valid SQLite database.");
  }

  if (!hasKnownApplicationTables(normalizedSourcePath)) {
    throw new Error("The selected database does not look like an AI Novel Writing Assistant local database.");
  }

  return normalizedSourcePath;
}

export function resolveSuggestedLegacyDatabasePath(): string | null {
  return getDesktopDataImportSnapshot().suggestedSourcePath;
}

export function importLegacyDatabaseFromPath(sourcePath: string): DesktopDataImportResult {
  const currentDatabasePath = resolveDesktopDatabasePath();
  const normalizedSourcePath = validateImportSource(sourcePath, currentDatabasePath);
  const backup = backupDatabaseBundle(currentDatabasePath);

  appendDesktopLog(
    "desktop.data-import",
    `Importing legacy database from ${normalizedSourcePath} into ${currentDatabasePath}.`,
  );

  try {
    copyDatabaseBundle(normalizedSourcePath, currentDatabasePath);

    if (!hasKnownApplicationTables(currentDatabasePath)) {
      throw new Error("Imported database verification failed after copying the selected file.");
    }

    appendDesktopLog(
      "desktop.data-import",
      `Legacy database import finished. backup=${backup?.backupDirectory ?? "none"}.`,
    );

    return {
      importedFrom: normalizedSourcePath,
      importedTo: currentDatabasePath,
      backupDirectory: backup?.backupDirectory ?? null,
    };
  } catch (error) {
    if (backup) {
      try {
        restoreDatabaseBundle(backup.backupDirectory, currentDatabasePath);
        appendDesktopLog(
          "desktop.data-import",
          `Legacy database import failed. Restored desktop database from ${backup.backupDirectory}.`,
          "warn",
        );
      } catch (restoreError) {
        logDesktopError("desktop.data-import.restore", restoreError);
      }
    }
    throw error;
  }
}
