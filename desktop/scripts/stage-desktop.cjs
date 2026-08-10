const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  assertAllSymlinksWithinDirectory,
  assertExactToolchain,
  assertExists,
  assertNativeTargetMatchesHost,
  assertPathWithinDirectory,
  assertStableHoistedPackage,
  buildStageManifest,
  parseStageCli,
  resolveDesktopReleaseContract,
  resolvePackageDirectory,
} = require("./desktop-stage-contract.cjs");
const {
  createPackageReleaseMetadata,
  renderAppUpdateConfig,
} = require("./release-contract.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.resolve(__dirname, "..");
const serverDir = path.join(repoRoot, "server");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const resourcesDir = path.join(buildDir, "resources");
const stageManifestPath = path.join(buildDir, "stage-manifest.json");
const releaseContractPath = path.join(resourcesDir, "release-contract.json");
const appUpdateConfigPath = path.join(resourcesDir, "app-update.yml");
const clientSourceDir = path.join(repoRoot, "client", "dist");
const clientTargetDir = path.join(resourcesDir, "client", "dist");
const stagedNodeModulesDir = path.join(appDir, "node_modules");
const serverEntry = path.join(stagedNodeModulesDir, "@ai-novel", "server", "dist", "app.js");
const desktopMainEntry = path.join(appDir, "dist", "main.js");
const prismaClientEntrypointFiles = [
  { fileName: "default.js", generatedEntry: "./generated-client/default" },
  { fileName: "index.js", generatedEntry: "./generated-client/index" },
  { fileName: "edge.js", generatedEntry: "./generated-client/edge" },
];

function runCorepackPnpm(args, cwd = repoRoot) {
  execFileSync("corepack", ["pnpm", ...args], {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
}

function ensureCleanDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyDirectory(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  ensureDir(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

function replaceFileContents(targetPath, contents) {
  fs.rmSync(targetPath, { force: true });
  fs.writeFileSync(targetPath, contents, "utf8");
}

function declareStagedPackageManager() {
  const packageJsonPath = path.join(appDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  packageJson.packageManager = "pnpm@10.6.0";
  replaceFileContents(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function writeDesktopReleaseArtifacts(releaseContract) {
  const packageMetadata = createPackageReleaseMetadata(releaseContract);
  fs.writeFileSync(releaseContractPath, `${JSON.stringify(packageMetadata, null, 2)}\n`, "utf8");
  fs.rmSync(appUpdateConfigPath, { force: true });
  if (releaseContract.updatesEnabled) {
    fs.writeFileSync(appUpdateConfigPath, renderAppUpdateConfig(releaseContract), "utf8");
  }
}

function resolveWorkspaceGeneratedPrismaClientDir() {
  const prismaClientPackageDir = resolvePackageDirectory("@prisma/client", [serverDir, repoRoot]);
  const prismaClientRequire = createRequire(path.join(fs.realpathSync(prismaClientPackageDir), "package.json"));
  const generatedDefaultEntry = prismaClientRequire.resolve(".prisma/client/default.js");
  const generatedClientDir = path.dirname(generatedDefaultEntry);
  assertExists(path.join(generatedClientDir, "index.js"), "workspace generated Prisma client");
  return generatedClientDir;
}

function patchPrismaClientEntrypoint(entrypointPath, generatedEntry) {
  replaceFileContents(
    entrypointPath,
    `module.exports = {\n  ...require('${generatedEntry}'),\n}\n`,
  );
}

function syncPrismaRuntime() {
  const generatedClientDir = resolveWorkspaceGeneratedPrismaClientDir();
  const stagedPrismaClientDir = assertStableHoistedPackage(appDir, "@prisma/client");
  const stableGeneratedClientDir = path.join(stagedNodeModulesDir, ".prisma", "client");
  const embeddedGeneratedClientDir = path.join(stagedPrismaClientDir, "generated-client");

  copyDirectory(generatedClientDir, stableGeneratedClientDir);
  copyDirectory(generatedClientDir, embeddedGeneratedClientDir);

  const prismaClientPackageJsonPath = path.join(stagedPrismaClientDir, "package.json");
  const prismaClientPackageJson = JSON.parse(fs.readFileSync(prismaClientPackageJsonPath, "utf8"));
  if (!Array.isArray(prismaClientPackageJson.files)) {
    prismaClientPackageJson.files = [];
  }
  if (!prismaClientPackageJson.files.includes("generated-client")) {
    prismaClientPackageJson.files.push("generated-client");
  }
  replaceFileContents(prismaClientPackageJsonPath, `${JSON.stringify(prismaClientPackageJson, null, 2)}\n`);

  for (const { fileName, generatedEntry } of prismaClientEntrypointFiles) {
    patchPrismaClientEntrypoint(path.join(stagedPrismaClientDir, fileName), generatedEntry);
  }
}

function validateStagedLayout(releaseContract) {
  assertExists(desktopMainEntry, "desktop main bundle");
  assertExists(serverEntry, "bundled server entry");
  assertExists(path.join(clientTargetDir, "index.html"), "bundled renderer entry");
  assertExists(releaseContractPath, "packaged desktop release metadata");
  if (releaseContract.updatesEnabled) {
    assertExists(appUpdateConfigPath, "desktop updater configuration");
  } else if (fs.existsSync(appUpdateConfigPath)) {
    throw new Error("app-update.yml must not exist when updates are disabled.");
  }
  assertExists(
    path.join(stagedNodeModulesDir, ".prisma", "client", "default.js"),
    "stable hoisted generated Prisma runtime",
  );
  assertExists(
    path.join(stagedNodeModulesDir, "@prisma", "client", "generated-client", "default.js"),
    "embedded generated Prisma client",
  );

  assertAllSymlinksWithinDirectory(appDir);
  for (const packageName of ["better-sqlite3", "sharp", "@prisma/client"]) {
    const packageDir = assertStableHoistedPackage(appDir, packageName);
    assertPathWithinDirectory(packageDir, appDir, `${packageName} staged package`);
  }
}

function main() {
  const options = parseStageCli(process.argv.slice(2));
  assertNativeTargetMatchesHost(options);
  assertExactToolchain(repoRoot, desktopDir);
  assertExists(clientSourceDir, "built client assets");
  const releaseContract = resolveDesktopReleaseContract({
    repoRoot,
    desktopDir,
    platform: options.platform,
    mode: options.mode,
    env: process.env,
  });

  ensureCleanDir(buildDir);
  ensureDir(resourcesDir);

  runCorepackPnpm([
    "--filter",
    "@ai-novel/desktop",
    "deploy",
    "--prod",
    "--config.node-linker=hoisted",
    appDir,
  ]);

  declareStagedPackageManager();
  copyDirectory(clientSourceDir, clientTargetDir);
  writeDesktopReleaseArtifacts(releaseContract);
  syncPrismaRuntime();
  validateStagedLayout(releaseContract);

  const stageManifest = buildStageManifest({
    repoRoot,
    desktopDir,
    appDir,
    resourcesDir,
    releaseContract,
    ...options,
  });
  fs.writeFileSync(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`, "utf8");

  console.log(`[stage:desktop] app staged at ${appDir}`);
  console.log(`[stage:desktop] renderer resources staged at ${clientTargetDir}`);
  console.log(`[stage:desktop] manifest written to ${stageManifestPath}`);
}

try {
  main();
} catch (error) {
  console.error("[stage:desktop] failed.", error);
  process.exit(1);
}
