const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { createRequire } = require("node:module");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.resolve(__dirname, "..");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const resourcesDir = path.join(buildDir, "resources");
const appUpdateConfigPath = path.join(resourcesDir, "app-update.yml");
const clientSourceDir = path.join(repoRoot, "client", "dist");
const clientTargetDir = path.join(resourcesDir, "client", "dist");
const serverEntry = path.join(appDir, "node_modules", "@ai-novel", "server", "dist", "app.js");
const desktopMainEntry = path.join(appDir, "dist", "main.js");
const stagedNodeModulesDir = path.join(appDir, "node_modules");
const stagedNativePackagesToDetach = ["better-sqlite3"];
const prismaClientEntrypointFiles = [
  { fileName: "default.js", generatedEntry: "./generated-client/default" },
  { fileName: "index.js", generatedEntry: "./generated-client/index" },
  { fileName: "edge.js", generatedEntry: "./generated-client/edge" },
];

function runPnpm(args, cwd = repoRoot) {
  const command = `pnpm ${args.map((arg) => `"${arg}"`).join(" ")}`;
  execSync(command, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: true,
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
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

function replaceDirectoryWithPhysicalCopy(targetDir) {
  const tempDir = `${targetDir}.__detached__`;
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.cpSync(targetDir, tempDir, { recursive: true, force: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(tempDir, targetDir);
}

function replaceFileContents(targetPath, contents) {
  fs.rmSync(targetPath, { force: true });
  fs.writeFileSync(targetPath, contents, "utf8");
}

function writeDesktopUpdaterConfig() {
  const releaseChannel = (process.env.AI_NOVEL_RELEASE_CHANNEL || "beta").trim().toLowerCase();
  const releaseType = releaseChannel === "beta" ? "prerelease" : "release";
  const owner = (process.env.AI_NOVEL_GITHUB_OWNER || "ExplosiveCoderflome").trim();
  const repo = (process.env.AI_NOVEL_GITHUB_REPO || "AI-Novel-Writing-Assistant").trim();
  const config = [
    "provider: github",
    `owner: ${owner}`,
    `repo: ${repo}`,
    `channel: ${releaseChannel}`,
    `releaseType: ${releaseType}`,
    "updaterCacheDirName: ai-novel-writing-assistant-v2-updater",
    "",
  ].join("\n");
  fs.writeFileSync(appUpdateConfigPath, config, "utf8");
}

function resolveWorkspacePrismaGeneratedDir() {
  const pnpmVirtualStoreDir = path.join(repoRoot, "node_modules", ".pnpm");
  assertExists(pnpmVirtualStoreDir, "workspace virtual store");

  const prismaClientStoreEntries = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));

  for (const entry of prismaClientStoreEntries) {
    const generatedDir = path.join(pnpmVirtualStoreDir, entry.name, "node_modules", ".prisma");
    if (fs.existsSync(path.join(generatedDir, "client", "default.js"))) {
      return generatedDir;
    }
  }

  throw new Error(`Expected a generated Prisma runtime directory under ${pnpmVirtualStoreDir}, but none was found.`);
}

function resolveStagedPrismaClientPackageDirs() {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");

  const prismaClientStoreEntries = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));

  if (prismaClientStoreEntries.length === 0) {
    throw new Error("Expected at least one staged @prisma/client package in the virtual store.");
  }

  return prismaClientStoreEntries.map((entry) => ({
    storeEntryName: entry.name,
    packageDir: path.join(pnpmVirtualStoreDir, entry.name, "node_modules", "@prisma", "client"),
  }));
}

function resolveStagedPackageDirsByName(packageName) {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");

  const matches = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`))
    .map((entry) => path.join(pnpmVirtualStoreDir, entry.name, "node_modules", packageName))
    .filter((packageDir) => fs.existsSync(packageDir));

  return Array.from(new Set(matches));
}

function patchPrismaClientEntrypoint(entrypointPath, generatedEntry) {
  const entrypointSource = `module.exports = {
  ...require('${generatedEntry}'),
}
`;

  replaceFileContents(entrypointPath, entrypointSource);
}

function embedPrismaGeneratedClient(prismaClientPackageDir, generatedPrismaDir) {
  const generatedPrismaClientDir = path.join(generatedPrismaDir, "client");
  const embeddedGeneratedClientDir = path.join(prismaClientPackageDir, "generated-client");
  const prismaClientPackageJsonPath = path.join(prismaClientPackageDir, "package.json");
  const prismaClientPackageJson = JSON.parse(fs.readFileSync(prismaClientPackageJsonPath, "utf8"));

  copyDirectory(generatedPrismaClientDir, embeddedGeneratedClientDir);

  if (!Array.isArray(prismaClientPackageJson.files)) {
    prismaClientPackageJson.files = [];
  }
  if (!prismaClientPackageJson.files.includes("generated-client")) {
    prismaClientPackageJson.files.push("generated-client");
  }

  replaceFileContents(prismaClientPackageJsonPath, `${JSON.stringify(prismaClientPackageJson, null, 2)}\n`);

  for (const { fileName, generatedEntry } of prismaClientEntrypointFiles) {
    patchPrismaClientEntrypoint(path.join(prismaClientPackageDir, fileName), generatedEntry);
  }
}

function syncPrismaRuntime() {
  const generatedPrismaDir = resolveWorkspacePrismaGeneratedDir();
  const stagedTopLevelPrismaDir = path.join(stagedNodeModulesDir, ".prisma");
  const stagedPrismaClientPackages = resolveStagedPrismaClientPackageDirs();

  copyDirectory(generatedPrismaDir, stagedTopLevelPrismaDir);

  for (const { storeEntryName, packageDir } of stagedPrismaClientPackages) {
    const nestedPrismaDir = path.join(stagedNodeModulesDir, ".pnpm", storeEntryName, "node_modules", ".prisma");
    const packageLocalPrismaDir = path.join(
      stagedNodeModulesDir,
      ".pnpm",
      storeEntryName,
      "node_modules",
      "@prisma",
      "client",
      "node_modules",
      ".prisma",
    );
    copyDirectory(generatedPrismaDir, nestedPrismaDir);
    copyDirectory(generatedPrismaDir, packageLocalPrismaDir);
    embedPrismaGeneratedClient(packageDir, generatedPrismaDir);
  }
}

function detachStagedNativePackages() {
  for (const packageName of stagedNativePackagesToDetach) {
    for (const packageDir of resolveStagedPackageDirsByName(packageName)) {
      replaceDirectoryWithPhysicalCopy(packageDir);
    }
  }
}

function detachStagedWorkspaceLinks() {
  // `pnpm deploy` on machines where the lockfile snapshot resolves to an absolute file: path
  // (e.g. macOS checkouts) links workspace packages like @ai-novel/server as symlinks into the
  // pnpm virtual store. electron-builder then copies the store directory under its hashed name
  // (e.g. "@ai-novel/server@file:server(...)") instead of "@ai-novel/server", breaking the
  // packaged layout that the desktop runtime and verify script expect. Materialize the links
  // as physical directories so electron-builder packs them under the declared package name.
  const workspaceScopeDir = path.join(stagedNodeModulesDir, "@ai-novel");
  if (!fs.existsSync(workspaceScopeDir)) {
    return;
  }

  for (const entry of fs.readdirSync(workspaceScopeDir, { withFileTypes: true })) {
    const packageDir = path.join(workspaceScopeDir, entry.name);
    if (fs.lstatSync(packageDir).isSymbolicLink()) {
      // fs.cpSync preserves symlinks by default, so copying the link itself would put the link
      // right back after the rename. Copy the resolved target together with its private
      // node_modules sibling (the pnpm store layout keeps this package's own dependency links
      // there), so require() keeps resolving after the symlink is gone.
      const realPackageDir = fs.realpathSync(packageDir);
      const tempDir = `${packageDir}.__detached__`;
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.cpSync(realPackageDir, tempDir, { recursive: true, force: true });
      // Store layout: <storePkg>/node_modules/@ai-novel/<name> — the package's own dependency
      // links live in <storePkg>/node_modules, i.e. three levels above the package dir.
      const privateNodeModulesSource = path.resolve(realPackageDir, "..", "..", "..", "node_modules");
      if (path.basename(privateNodeModulesSource) === "node_modules" && fs.existsSync(privateNodeModulesSource)) {
        const privateNodeModules = path.join(tempDir, "node_modules");
        fs.rmSync(privateNodeModules, { recursive: true, force: true });
        fs.cpSync(privateNodeModulesSource, privateNodeModules, { recursive: true, force: true });
      }
      fs.rmSync(packageDir, { force: true });
      fs.renameSync(tempDir, packageDir);
      console.log(`[stage:desktop] materialized workspace link ${entry.name}`);
    }
  }
}

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected ${description} at ${targetPath}, but it was not found.`);
  }
}

function assertStagedServerDependencies(deployedAppDir = appDir) {
  const manifestPath = path.join(deployedAppDir, "node_modules", "@ai-novel", "server", "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const resolveFromServer = createRequire(fs.realpathSync(manifestPath));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    let resolved;
    try {
      resolved = fs.realpathSync(resolveFromServer.resolve(dependency));
    } catch (cause) {
      throw new Error(`Staged server production dependency ${dependency} is missing. Check the injected file:server snapshot in pnpm-lock.yaml.`, { cause });
    }
    const relative = path.relative(deployedAppDir, resolved);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Staged server production dependency ${dependency} resolves outside the deployed application.`);
    }
  }
}

function main() {
  assertExists(clientSourceDir, "built client assets");

  ensureCleanDir(buildDir);
  ensureDir(resourcesDir);
  ensureDir(path.dirname(clientTargetDir));

  runPnpm([
    "--filter",
    "@ai-novel/desktop",
    "deploy",
    "--prod",
    appDir,
  ]);

  copyDirectory(clientSourceDir, clientTargetDir);
  writeDesktopUpdaterConfig();
  syncPrismaRuntime();
  detachStagedNativePackages();
  detachStagedWorkspaceLinks();
  assertStagedServerDependencies();

  assertExists(desktopMainEntry, "desktop main bundle");
  assertExists(serverEntry, "bundled server entry");
  assertExists(path.join(clientTargetDir, "index.html"), "bundled renderer entry");
  assertExists(appUpdateConfigPath, "desktop updater configuration");
  assertExists(path.join(stagedNodeModulesDir, ".prisma", "client", "default.js"), "bundled Prisma runtime");
  const [firstStagedPrismaClientPackage] = resolveStagedPrismaClientPackageDirs();
  assertExists(
    path.join(firstStagedPrismaClientPackage.packageDir, "node_modules", ".prisma", "client", "default.js"),
    "bundled Prisma runtime beside @prisma/client",
  );
  assertExists(
    path.join(firstStagedPrismaClientPackage.packageDir, "generated-client", "default.js"),
    "embedded generated Prisma client",
  );

  console.log(`[stage:desktop] app staged at ${appDir}`);
  console.log(`[stage:desktop] renderer resources staged at ${clientTargetDir}`);
}

module.exports = { assertStagedServerDependencies };

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("[stage:desktop] failed.", error);
    process.exit(1);
  }
}
