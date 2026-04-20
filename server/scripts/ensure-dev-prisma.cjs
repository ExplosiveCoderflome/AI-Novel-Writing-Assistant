const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(rootDir, "..");
const schemaPath = path.join(rootDir, "src", "prisma", "schema.prisma");
const dbPath = path.join(rootDir, "dev.db");
const generatedClientPath = path.join(rootDir, "node_modules", "@prisma", "client", "index.js");
const stampPath = path.join(rootDir, ".tmp", "prisma-dev-prepare.json");
const prismaCliPath = path.join(rootDir, "node_modules", "prisma", "build", "index.js");

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

function runNodeProbe(script, cwd) {
  return spawnSync(process.execPath, ["-e", script], {
    cwd,
    env: process.env,
    encoding: "utf8",
  });
}

function canLoadPrismaClient() {
  const result = runNodeProbe(
    `
    const client = require("@prisma/client");
    if (typeof client.PrismaClient !== "function") {
      throw new Error("PrismaClient export is unavailable.");
    }
    console.log("ok");
    `,
    rootDir,
  );
  return result.status === 0;
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

function resolvePrebuildInstallCliPath() {
  const pnpmVirtualStoreDir = path.join(repoRoot, "node_modules", ".pnpm");
  const match = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.startsWith("prebuild-install@"));

  if (!match) {
    throw new Error(`Unable to resolve prebuild-install under ${pnpmVirtualStoreDir}.`);
  }

  return path.join(pnpmVirtualStoreDir, match.name, "node_modules", "prebuild-install", "bin.js");
}

function canLoadBetterSqlite3Binding(betterSqlite3Dir) {
  const result = runNodeProbe(
    `
    const Database = require(process.cwd());
    const db = new Database(":memory:");
    console.log(db.prepare("select 1 as x").get().x);
    db.close();
    `,
    betterSqlite3Dir,
  );
  return result.status === 0;
}

function repairBetterSqlite3Binding(betterSqlite3Dir) {
  const prebuildInstallCliPath = resolvePrebuildInstallCliPath();
  const staleBindingCandidates = [
    path.join(betterSqlite3Dir, "build", "Release", "better_sqlite3.node"),
    path.join(betterSqlite3Dir, "build", "Debug", "better_sqlite3.node"),
  ];

  for (const candidate of staleBindingCandidates) {
    fs.rmSync(candidate, { force: true });
  }

  const result = spawnSync(process.execPath, [prebuildInstallCliPath], {
    cwd: betterSqlite3Dir,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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
  if (hasBinding && canLoadBetterSqlite3Binding(betterSqlite3Dir)) {
    return;
  }

  console.log("[dev-prisma] better-sqlite3 binding missing or incompatible, refreshing native binary...");
  repairBetterSqlite3Binding(betterSqlite3Dir);

  if (!canLoadBetterSqlite3Binding(betterSqlite3Dir)) {
    console.error("[dev-prisma] better-sqlite3 native binding is still unhealthy after refresh.");
    process.exit(1);
  }
}

function main() {
  ensureBetterSqlite3Binding();

  const schemaStat = fs.statSync(schemaPath);
  const stamp = readJson(stampPath);
  const schemaMtimeMs = schemaStat.mtimeMs;
  const schemaChanged = !stamp || stamp.schemaMtimeMs !== schemaMtimeMs;
  const missingGeneratedClient = !fs.existsSync(generatedClientPath) || !canLoadPrismaClient();
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
