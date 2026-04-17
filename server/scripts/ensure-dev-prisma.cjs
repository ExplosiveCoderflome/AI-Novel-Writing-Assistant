const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const schemaPath = path.join(rootDir, "src", "prisma", "schema.prisma");
const dbPath = path.join(rootDir, "dev.db");
const generatedClientPath = path.join(rootDir, "node_modules", "@prisma", "client", "index.js");
const stampPath = path.join(rootDir, ".tmp", "prisma-dev-prepare.json");
const prismaCliPath = path.join(rootDir, "node_modules", "prisma", "build", "index.js");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveBetterSqlite3Dir() {
  const adapterEntryPath = require.resolve("@prisma/adapter-better-sqlite3", {
    paths: [rootDir],
  });
  const adapterDir = path.dirname(adapterEntryPath);
  const betterSqlitePkgPath = require.resolve("better-sqlite3/package.json", {
    paths: [adapterDir],
  });
  return path.dirname(betterSqlitePkgPath);
}

function ensureBetterSqlite3Binding() {
  let betterSqlite3Dir;
  try {
    betterSqlite3Dir = resolveBetterSqlite3Dir();
  } catch (error) {
    console.warn("[dev-prisma] unable to resolve better-sqlite3 package.", error);
    return;
  }

  const bindingCandidates = [
    path.join(betterSqlite3Dir, "build", "Release", "better_sqlite3.node"),
    path.join(betterSqlite3Dir, "build", "Debug", "better_sqlite3.node"),
  ];
  const hasBinding = bindingCandidates.some((candidate) => fs.existsSync(candidate));
  if (hasBinding) {
    return;
  }

  console.log("[dev-prisma] better-sqlite3 binding missing, running package install...");
  const result = spawnSync(pnpmCommand, ["--dir", betterSqlite3Dir, "run", "install"], {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  ensureBetterSqlite3Binding();

  const schemaStat = fs.statSync(schemaPath);
  const stamp = readJson(stampPath);
  const schemaMtimeMs = schemaStat.mtimeMs;
  const schemaChanged = !stamp || stamp.schemaMtimeMs !== schemaMtimeMs;
  const missingGeneratedClient = !fs.existsSync(generatedClientPath);
  const missingDb = !fs.existsSync(dbPath);

  if (!schemaChanged && !missingGeneratedClient && !missingDb) {
    console.log("[dev-prisma] schema unchanged, skipping prisma generate/push.");
    return;
  }

  if (schemaChanged || missingGeneratedClient) {
    console.log("[dev-prisma] running prisma generate...");
    runPrisma(["generate", "--schema", "src/prisma/schema.prisma"]);
  }

  if (schemaChanged || missingDb) {
    console.log("[dev-prisma] running prisma push...");
    runPrisma(["db", "push", "--schema", "src/prisma/schema.prisma"]);
  }

  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(stampPath, `${JSON.stringify({ schemaMtimeMs }, null, 2)}\n`, "utf8");
}

main();
