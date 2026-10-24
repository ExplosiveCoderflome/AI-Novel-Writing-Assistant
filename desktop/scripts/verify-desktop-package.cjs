const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..");
const electronBuilderPackageJson = require.resolve("electron-builder/package.json", { paths: [desktopDir] });
const electronBuilderRequire = createRequire(electronBuilderPackageJson);
const asar = electronBuilderRequire("@electron/asar");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const distDir = path.join(buildDir, "dist");
const appProductName = "Biz Novel Studio";
const targetPlatform = detectTargetPlatform(process.argv.slice(2));
const isMac = targetPlatform === "mac";
const unpackedDir = isMac ? resolveMacUnpackedDir() : path.join(distDir, "win-unpacked");
const unpackedResourcesDir = isMac
  ? path.join(unpackedDir, `${appProductName}.app`, "Contents", "Resources")
  : path.join(unpackedDir, "resources");
const builderWindowIcon = path.join(desktopDir, "builder", isMac ? "app-icon.icns" : "app-icon.ico");
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
const sourceServerSqliteMigrationsDir = path.join(repoRoot, "server", "src", "prisma", "migrations.sqlite");
const stagedServerSqliteMigrationsDir = path.join(appDir, "node_modules", "@ai-novel", "server", "src", "prisma", "migrations.sqlite");
const stagedAppUpdateConfig = path.join(buildDir, "resources", "app-update.yml");
const stagedClientIndex = path.join(buildDir, "resources", "client", "dist", "index.html");
const unpackedClientIndex = path.join(unpackedResourcesDir, "client", "dist", "index.html");
const unpackedAppArchive = path.join(unpackedResourcesDir, "app.asar");
const unpackedWindowIcon = path.join(unpackedResourcesDir, "icons", isMac ? "app-icon.icns" : "app-icon.ico");
const stagedRuntimeFile = path.join(appDir, "dist", "runtime", "server.js");

function detectTargetPlatform(args) {
  for (const rawArg of args) {
    const arg = rawArg.replace(/^--?/, "").toLowerCase();
    if (arg === "mac" || arg === "macos" || arg === "darwin") {
      return "mac";
    }
    if (arg === "win" || arg === "windows") {
      return "win";
    }
  }

  return process.platform === "darwin" ? "mac" : "win";
}

function resolveMacUnpackedDir() {
  // electron-builder writes arch-specific output folders on macOS, e.g. mac-arm64.
  const candidates = fs.existsSync(distDir)
    ? fs.readdirSync(distDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("mac"))
        .map((entry) => path.join(distDir, entry.name))
    : [];

  const withApp = candidates.filter((candidate) => fs.existsSync(path.join(candidate, `${appProductName}.app`)));
  if (withApp.length === 0) {
    return path.join(distDir, "mac-arm64");
  }

  return withApp.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

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

function listMigrationNames(migrationsDir) {
  return fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findFirstFileRecursive(rootDir, predicate) {
  if (!fs.existsSync(rootDir)) {
    return null;
  }

  const pending = [rootDir];
  while (pending.length > 0) {
    const currentDir = pending.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (predicate(entry.name)) {
        return entryPath;
      }
    }
  }

  return null;
}

function verifyMacAppBundle() {
  const appBundleDir = path.join(unpackedDir, `${appProductName}.app`);
  assertExists(appBundleDir, "packaged macOS app bundle");

  const contentsDir = path.join(appBundleDir, "Contents");
  const infoPlistPath = path.join(contentsDir, "Info.plist");
  const macOsExecutablePath = path.join(contentsDir, "MacOS", appProductName);
  const bundleIconPath = path.join(unpackedResourcesDir, "icon.icns");
  assertExists(infoPlistPath, "packaged macOS Info.plist");
  assertExists(macOsExecutablePath, "packaged macOS executable");
  assertExists(bundleIconPath, "packaged macOS bundle icon");

  const infoPlistSource = fs.readFileSync(infoPlistPath, "utf8");
  if (!infoPlistSource.includes("com.ai-novel.desktop")) {
    throw new Error("Packaged macOS Info.plist is missing the expected bundle identifier.");
  }
  if (!infoPlistSource.includes("icon.icns")) {
    throw new Error("Packaged macOS Info.plist does not reference the branded bundle icon.");
  }

  const unpackedNodeModulesDir = path.join(unpackedResourcesDir, "app.asar.unpacked", "node_modules");
  const nativeModulePath = findFirstFileRecursive(unpackedNodeModulesDir, (name) => name === "better_sqlite3.node");
  if (!nativeModulePath) {
    throw new Error(`Packaged macOS app is missing the unpacked better-sqlite3 native binding under ${unpackedNodeModulesDir}.`);
  }

  console.log(`[verify:desktop-package] macOS app bundle inspected at ${appBundleDir}`);
  console.log(`[verify:desktop-package] native binding: ${nativeModulePath}`);
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
  assertExists(sourceServerSqliteMigrationsDir, "source SQLite migrations");
  assertExists(stagedServerSqliteMigrationsDir, "staged SQLite migrations");
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

  // asar entries are prefixed with the host path separator, so both `\dist\x`
  // (Windows) and `/dist/x` (macOS/Linux) must normalize to `dist/x`.
  const packagedFiles = new Set(
    asar.listPackage(unpackedAppArchive).map((entry) => entry.replace(/^[\\/]/, "").replace(/\\/g, "/")),
  );
  const packagedEntries = Array.from(packagedFiles);
  const sourceSqliteMigrations = listMigrationNames(sourceServerSqliteMigrationsDir);
  const stagedSqliteMigrations = listMigrationNames(stagedServerSqliteMigrationsDir);
  if (JSON.stringify(stagedSqliteMigrations) !== JSON.stringify(sourceSqliteMigrations)) {
    throw new Error("Staged SQLite migrations do not match the source migration set.");
  }
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
  for (const migrationName of sourceSqliteMigrations) {
    assertSomeMatch(
      packagedEntries,
      new RegExp(`^node_modules/(?:\\.pnpm/[^/]+/node_modules/)?@ai-novel/server/src/prisma/migrations\\.sqlite/${escapeRegExp(migrationName)}/migration\\.sql$`),
      `SQLite migration ${migrationName} inside app.asar`,
    );
  }
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

  if (isMac) {
    verifyMacAppBundle();
  }

  console.log("[verify:desktop-package] staged package layout looks valid.");
  console.log(`[verify:desktop-package] unpacked app inspected at ${unpackedDir}`);
}

try {
  main();
} catch (error) {
  console.error("[verify:desktop-package] failed.", error);
  process.exit(1);
}
