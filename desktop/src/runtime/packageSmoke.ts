import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electron";
import { resolveDesktopServerPort, startDesktopServer } from "./server";
import { resolveRendererIndexHtml } from "./paths";

const PACKAGE_SMOKE_ARG = "--package-smoke";
const PACKAGE_SMOKE_OUTPUT_ARG = "--package-smoke-output";
const PACKAGE_SMOKE_TEMP_PREFIX = "ai-novel-packaged-smoke-";

interface SmokeCheck {
  ok: boolean;
  detail: string;
}

export interface PackageSmokeResult {
  ok: boolean;
  platform: NodeJS.Platform;
  arch: string;
  electronVersion: string;
  nodeAbi: string;
  checks: {
    betterSqlite3: SmokeCheck;
    sharp: SmokeCheck;
    prisma: SmokeCheck;
    serverHealth: SmokeCheck;
    rendererEntry: SmokeCheck;
  };
  error?: string;
}

interface BetterSqliteDatabase {
  exec(source: string): void;
  prepare(source: string): {
    run(...values: unknown[]): unknown;
    get(...values: unknown[]): unknown;
  };
  close(): void;
}

interface BetterSqliteConstructor {
  new (filePath: string): BetterSqliteDatabase;
}

interface SharpFactory {
  (options: {
    create: {
      width: number;
      height: number;
      channels: number;
      background: { r: number; g: number; b: number; alpha: number };
    };
  }): {
    png(): { toBuffer(): Promise<Buffer> };
  };
}

interface PrismaClientLike {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  $disconnect(): Promise<void>;
}

function requiredEnvironmentPath(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for packaged smoke and must point to a fresh temporary directory.`);
  }
  return path.resolve(value);
}

function assertSmokeRootIsTemporary(smokeRoot: string): void {
  if (!path.basename(smokeRoot).startsWith(PACKAGE_SMOKE_TEMP_PREFIX)) {
    throw new Error(`Packaged smoke root must use the ${PACKAGE_SMOKE_TEMP_PREFIX} temporary prefix.`);
  }
  const relativeToSystemTemp = path.relative(path.resolve(os.tmpdir()), smokeRoot);
  if (
    relativeToSystemTemp === ""
    || relativeToSystemTemp === ".."
    || relativeToSystemTemp.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeToSystemTemp)
  ) {
    throw new Error("Packaged smoke root must be a child of the operating system temporary directory.");
  }
  const appDataDir = requiredEnvironmentPath("AI_NOVEL_APP_DATA_DIR");
  const relativeAppData = path.relative(smokeRoot, appDataDir);
  if (
    relativeAppData === ""
    || relativeAppData === ".."
    || relativeAppData.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeAppData)
  ) {
    throw new Error("AI_NOVEL_APP_DATA_DIR must be a child of the packaged smoke temporary root.");
  }
}

function assertPathIsInsideSmokeRoot(smokeRoot: string, targetPath: string, description: string): void {
  const relativeTarget = path.relative(smokeRoot, targetPath);
  if (
    relativeTarget === ""
    || relativeTarget === ".."
    || relativeTarget.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeTarget)
  ) {
    throw new Error(`${description} must be a child of the packaged smoke temporary root.`);
  }
}

function resolveOutputPath(args: string[]): string {
  const index = args.indexOf(PACKAGE_SMOKE_OUTPUT_ARG);
  const outputPath = index >= 0 ? args[index + 1]?.trim() : "";
  if (!outputPath || outputPath.startsWith("--")) {
    throw new Error(`${PACKAGE_SMOKE_OUTPUT_ARG} requires a JSON output path.`);
  }
  return path.resolve(outputPath);
}

function successfulCheck(detail: string): SmokeCheck {
  return { ok: true, detail };
}

function emptyChecks(): PackageSmokeResult["checks"] {
  const pending = { ok: false, detail: "not-run" };
  return {
    betterSqlite3: { ...pending },
    sharp: { ...pending },
    prisma: { ...pending },
    serverHealth: { ...pending },
    rendererEntry: { ...pending },
  };
}

function smokeBetterSqlite3(smokeRoot: string): SmokeCheck {
  const BetterSqlite3 = require("better-sqlite3") as BetterSqliteConstructor;
  const databasePath = path.join(smokeRoot, "better-sqlite3-smoke.sqlite");
  const database = new BetterSqlite3(databasePath);
  try {
    database.exec("CREATE TABLE smoke_value (id INTEGER PRIMARY KEY, value TEXT NOT NULL)");
    database.prepare("INSERT INTO smoke_value (value) VALUES (?)").run("electron-abi-ok");
    const row = database.prepare("SELECT value FROM smoke_value WHERE id = 1").get() as { value?: unknown } | undefined;
    if (row?.value !== "electron-abi-ok") {
      throw new Error("better-sqlite3 read-back did not match the inserted value.");
    }
  } finally {
    database.close();
  }
  return successfulCheck("created, wrote, and read a temporary SQLite database");
}

async function smokeSharp(): Promise<SmokeCheck> {
  const sharp = require("sharp") as SharpFactory;
  const png = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 4,
      background: { r: 12, g: 34, b: 56, alpha: 1 },
    },
  }).png().toBuffer();
  const pngSignature = "89504e470d0a1a0a";
  if (png.length <= 8 || png.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error("Sharp did not produce a valid 1x1 PNG buffer.");
  }
  return successfulCheck(`encoded a 1x1 PNG (${png.length} bytes)`);
}

async function smokePrisma(smokeRoot: string): Promise<SmokeCheck> {
  const { PrismaClient } = require("@prisma/client") as {
    PrismaClient: new (options: { adapter: unknown }) => PrismaClientLike;
  };
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3") as {
    PrismaBetterSqlite3: new (options: { url: string }) => unknown;
  };
  const databasePath = path.join(smokeRoot, "prisma-smoke.sqlite");
  const adapter = new PrismaBetterSqlite3({ url: `file:${databasePath}` });
  const prisma = new PrismaClient({ adapter });
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: number | bigint }>>("SELECT 1 AS value");
    if (!Array.isArray(rows) || Number(rows[0]?.value) !== 1) {
      throw new Error("Prisma SQLite SELECT 1 returned an unexpected result.");
    }
  } finally {
    await prisma.$disconnect();
  }
  return successfulCheck("executed SELECT 1 through Prisma's SQLite adapter");
}

async function startSmokeServer(): Promise<{
  check: SmokeCheck;
  port: number;
  stop: () => Promise<void>;
}> {
  process.env.AI_NOVEL_DESKTOP_SERVER_MODE = "managed";
  process.env.AI_NOVEL_DATABASE_MODE = "sqlite";
  process.env.RAG_ENABLED = "false";
  const port = await resolveDesktopServerPort({ isPackaged: true });
  const server = await startDesktopServer({ isPackaged: true, port });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const payload = await response.json() as { success?: unknown; data?: { status?: unknown } };
    if (!response.ok || payload.success !== true || payload.data?.status !== "ok") {
      throw new Error(`Packaged server health returned HTTP ${response.status}.`);
    }
    return {
      check: successfulCheck(`embedded server returned healthy on loopback port ${port}`),
      port,
      stop: server.stop,
    };
  } catch (error) {
    await server.stop();
    throw error;
  }
}

async function smokeRendererEntry(port: number): Promise<SmokeCheck> {
  const rendererEntry = resolveRendererIndexHtml();
  if (!fs.existsSync(rendererEntry)) {
    throw new Error(`Packaged renderer entry is missing: ${rendererEntry}`);
  }
  process.env.AI_NOVEL_DESKTOP_RUNTIME = JSON.stringify({
    mode: "desktop",
    apiBaseUrl: `http://127.0.0.1:${port}/api`,
    apiTimeoutMs: 30_000,
    isPackaged: true,
    appVersion: "smoke",
    isPortable: false,
    releaseMode: "verify",
    updateChannel: "disabled",
    updatesEnabled: false,
  });
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await window.loadFile(rendererEntry);
  } finally {
    window.destroy();
  }
  return successfulCheck("loaded the packaged renderer index in a hidden Electron window");
}

export function isPackagedSmokeRequested(args: string[]): boolean {
  return args.includes(PACKAGE_SMOKE_ARG);
}

export async function executePackagedSmoke(args: string[]): Promise<number> {
  let outputPath = "";
  let result: PackageSmokeResult = {
    ok: false,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron ?? "unknown",
    nodeAbi: process.versions.modules,
    checks: emptyChecks(),
  };

  try {
    outputPath = resolveOutputPath(args);
    const smokeRoot = requiredEnvironmentPath("AI_NOVEL_PACKAGE_SMOKE_ROOT");
    assertSmokeRootIsTemporary(smokeRoot);
    assertPathIsInsideSmokeRoot(smokeRoot, outputPath, "Packaged smoke JSON output");
    fs.mkdirSync(smokeRoot, { recursive: true });
    result.checks.betterSqlite3 = smokeBetterSqlite3(smokeRoot);
    result.checks.sharp = await smokeSharp();
    result.checks.prisma = await smokePrisma(smokeRoot);
    const serverHealth = await startSmokeServer();
    try {
      result.checks.serverHealth = serverHealth.check;
      result.checks.rendererEntry = await smokeRendererEntry(serverHealth.port);
    } finally {
      await serverHealth.stop();
    }
    result.ok = Object.values(result.checks).every((check) => check.ok);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  const serializedResult = `${JSON.stringify(result)}\n`;
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serializedResult, "utf8");
  }
  process.stdout.write(serializedResult);
  return result.ok ? 0 : 1;
}
