const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const desktopDir = path.resolve(__dirname, "..");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const unpackedDir = path.join(buildDir, "dist", "win-unpacked");
const builderWindowIcon = path.join(desktopDir, "builder", "app-icon.ico");
const appPackageJsonPath = path.join(appDir, "package.json");
const stagedServerEntry = path.join(appDir, "node_modules", "@ai-novel", "server", "dist", "app.js");
const stagedPrismaRuntimeEntry = path.join(appDir, "node_modules", ".prisma", "client", "default.js");
const stagedGeneratedPrismaClientEntry = path.join(
  appDir,
  "node_modules",
  ".pnpm",
  "node_modules",
  "@prisma",
  "client",
  "generated-client",
  "default.js",
);
const stagedServerMigrationsDir = path.join(appDir, "node_modules", "@ai-novel", "server", "src", "prisma", "migrations");
const stagedAppUpdateConfig = path.join(buildDir, "resources", "app-update.yml");
const stagedClientIndex = path.join(buildDir, "resources", "client", "dist", "index.html");
const unpackedClientIndex = path.join(unpackedDir, "resources", "client", "dist", "index.html");
const unpackedAppArchive = path.join(unpackedDir, "resources", "app.asar");
const unpackedWindowIcon = path.join(unpackedDir, "resources", "icons", "app-icon.ico");
const stagedRuntimeFile = path.join(appDir, "dist", "runtime", "server.js");

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${description}: ${targetPath}`);
  }
}

function assertNotExists(targetPath, description) {
  if (fs.existsSync(targetPath)) {
    throw new Error(`Unexpected ${description}: ${targetPath}`);
  }
}

function assertResolvesWithinDirectory(targetPath, expectedParentDir, description) {
  const resolvedPath = fs.realpathSync(targetPath);
  const normalizedParentDir = path.resolve(expectedParentDir);
  if (!resolvedPath.startsWith(normalizedParentDir)) {
    throw new Error(`${description} must resolve inside ${normalizedParentDir}, but resolved to ${resolvedPath}.`);
  }
}

function assertSomeMatch(entries, pattern, description) {
  const matchedEntry = entries.find((entry) => pattern.test(entry));
  if (!matchedEntry) {
    throw new Error(`Packaged app archive is missing ${description}.`);
  }
}

function main() {
  assertExists(appPackageJsonPath, "staged desktop package.json");
  assertExists(builderWindowIcon, "builder desktop window icon");
  assertExists(stagedAppUpdateConfig, "staged updater feed configuration");
  assertExists(stagedClientIndex, "staged renderer index");
  assertExists(unpackedClientIndex, "packaged renderer index");
  assertExists(unpackedAppArchive, "packaged app archive");
  assertExists(unpackedWindowIcon, "packaged desktop window icon");
  assertExists(stagedRuntimeFile, "desktop runtime server bundle");
  assertNotExists(path.join(appDir, "src"), "desktop source directory inside staged app");
  assertNotExists(path.join(appDir, "node_modules", "electron"), "Electron runtime inside staged app node_modules");
  assertResolvesWithinDirectory(
    path.join(appDir, "node_modules", "@ai-novel", "server"),
    appDir,
    "Staged server package",
  );

  const appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, "utf8"));
  if (appPackageJson.dependencies?.electron) {
    throw new Error("Electron must not be bundled as an application dependency in the staged app.");
  }

  const runtimeSource = fs.readFileSync(stagedRuntimeFile, "utf8");
  if (runtimeSource.includes("pnpm --filter @ai-novel/server start")) {
    throw new Error("Packaged desktop runtime still references pnpm-based server startup.");
  }
  const stagedClientIndexSource = fs.readFileSync(stagedClientIndex, "utf8");
  if (stagedClientIndexSource.includes('src="/assets/') || stagedClientIndexSource.includes('href="/assets/')) {
    throw new Error("Packaged desktop renderer still references absolute /assets paths.");
  }
  const updaterConfigSource = fs.readFileSync(stagedAppUpdateConfig, "utf8");
  if (!updaterConfigSource.includes("provider: github")) {
    throw new Error("Desktop updater feed configuration is missing the GitHub provider.");
  }

  const packagedFiles = new Set(asar.listPackage(unpackedAppArchive).map((entry) => entry.replace(/^\\/, "").replace(/\\/g, "/")));
  const packagedEntries = Array.from(packagedFiles);
  assertSomeMatch(
    packagedEntries,
    /^dist\/runtime\/server\.js$/,
    "desktop runtime server bundle inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@ai-novel\/server\/dist\/app\.js$/,
    "bundled server entry inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@ai-novel\/server\/src\/prisma\/migrations\/[^/]+\/migration\.sql$/,
    "bundled Prisma migration files inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@prisma\/client\/generated-client\/default\.js$/,
    "embedded generated Prisma client inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@prisma\/client\/default\.js$/,
    "packaged Prisma client entrypoint inside app.asar",
  );

  console.log("[verify:desktop-package] staged package layout looks valid.");
  console.log(`[verify:desktop-package] unpacked app inspected at ${unpackedDir}`);
}

try {
  main();
} catch (error) {
  console.error("[verify:desktop-package] failed.", error);
  process.exit(1);
}
