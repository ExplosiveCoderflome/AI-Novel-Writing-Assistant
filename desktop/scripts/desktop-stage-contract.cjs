const crypto = require("node:crypto");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const {
  createPackageReleaseMetadata,
  renderAppUpdateConfig,
  resolveReleaseContract,
} = require("./release-contract.cjs");

const STAGE_MANIFEST_VERSION = 1;
const EXPECTED_PACKAGE_MANAGER = "pnpm@10.6.0";
const EXPECTED_ELECTRON_VERSION = "35.7.5";
const EXPECTED_ELECTRON_BUILDER_VERSION = "26.8.1";
const VALID_PLATFORMS = new Set(["win", "mac"]);
const VALID_ARCHES = new Set(["x64", "arm64"]);
const VALID_MODES = new Set(["verify", "beta", "stable"]);
const SUPPORTED_PLATFORM_ARCHES = new Set(["win/x64", "mac/arm64"]);
const TARGETS_BY_PLATFORM = {
  win: new Set(["dir", "nsis", "portable", "all"]),
  mac: new Set(["dir", "dmg", "zip", "all"]),
};

function parseStrictOptions(args, optionNames) {
  const allowedOptions = new Set(optionNames);
  const parsed = {};

  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];

    if (option === "--publish" || value === "always") {
      throw new Error("Publishing is not accepted by this command. Packaging always uses --publish never.");
    }
    if (!allowedOptions.has(option)) {
      throw new Error(`Unknown or ambiguous option: ${option || "<missing>"}.`);
    }
    if (Object.prototype.hasOwnProperty.call(parsed, option)) {
      throw new Error(`Duplicate option is not allowed: ${option}.`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Option ${option} requires exactly one value.`);
    }
    parsed[option] = value;
  }

  if (args.length % 2 !== 0) {
    throw new Error(`Option ${args[args.length - 1]} requires exactly one value.`);
  }

  for (const option of optionNames) {
    if (!Object.prototype.hasOwnProperty.call(parsed, option)) {
      throw new Error(`Missing required option: ${option}.`);
    }
  }

  return parsed;
}

function validateCommonOptions(parsed) {
  const platform = parsed["--platform"];
  const arch = parsed["--arch"];
  const mode = parsed["--mode"];

  if (!VALID_PLATFORMS.has(platform)) {
    throw new Error(`Invalid --platform ${platform}. Expected win or mac.`);
  }
  if (!VALID_ARCHES.has(arch)) {
    throw new Error(`Invalid --arch ${arch}. Expected x64 or arm64.`);
  }
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid --mode ${mode}. Expected verify, beta, or stable.`);
  }
  if (!SUPPORTED_PLATFORM_ARCHES.has(`${platform}/${arch}`)) {
    throw new Error(
      `Unsupported desktop target ${platform}/${arch}. This phase supports only win/x64 and mac/arm64.`,
    );
  }

  return { platform, arch, mode };
}

function parseStageCli(args) {
  const parsed = parseStrictOptions(args, ["--platform", "--arch", "--mode"]);
  return validateCommonOptions(parsed);
}

function parseBuilderCli(args) {
  const parsed = parseStrictOptions(args, ["--platform", "--arch", "--mode", "--target"]);
  const common = validateCommonOptions(parsed);
  const target = parsed["--target"];

  if (!TARGETS_BY_PLATFORM[common.platform].has(target)) {
    throw new Error(
      `Invalid --target ${target} for ${common.platform}. Expected ${Array.from(TARGETS_BY_PLATFORM[common.platform]).join(", ")}.`,
    );
  }

  return { ...common, target };
}

function hostPlatform() {
  if (process.platform === "win32") {
    return "win";
  }
  if (process.platform === "darwin") {
    return "mac";
  }
  return process.platform;
}

function assertNativeTargetMatchesHost({ platform, arch }) {
  const currentPlatform = hostPlatform();
  if (platform !== currentPlatform || arch !== process.arch) {
    throw new Error(
      `Native-safe desktop staging/building must run on the target host. Requested ${platform}/${arch}, current host is ${currentPlatform}/${process.arch}.`,
    );
  }
}

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected ${description} at ${targetPath}, but it was not found.`);
  }
}

function assertPathWithinDirectory(targetPath, parentDir, description) {
  const resolvedTarget = fs.realpathSync(targetPath);
  const resolvedParent = fs.realpathSync(parentDir);
  const relative = path.relative(resolvedParent, resolvedTarget);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${description} escapes ${resolvedParent}: ${resolvedTarget}.`);
  }
  return resolvedTarget;
}

function assertAllSymlinksWithinDirectory(rootDir) {
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        assertPathWithinDirectory(entryPath, rootDir, `Staged symlink ${entryPath}`);
      } else if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }
}

function findPackageDirectoryFromEntry(entryPath, packageName) {
  let currentDir = path.dirname(entryPath);
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      if (packageJson.name === packageName) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error(`Could not locate package ${packageName} from resolved entry ${entryPath}.`);
}

function resolvePackageDirectory(packageName, searchPaths) {
  for (const searchPath of searchPaths) {
    const directPackageJsonPath = path.join(searchPath, "node_modules", ...packageName.split("/"), "package.json");
    if (fs.existsSync(directPackageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(directPackageJsonPath, "utf8"));
      if (packageJson.name === packageName) {
        return path.dirname(directPackageJsonPath);
      }
    }
  }

  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: searchPaths });
    return path.dirname(packageJsonPath);
  } catch (error) {
    if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED" && error?.code !== "MODULE_NOT_FOUND") {
      throw error;
    }
  }

  const entryPath = require.resolve(packageName, { paths: searchPaths });
  return findPackageDirectoryFromEntry(entryPath, packageName);
}

function resolveAppBuilderLibDirectory(searchPaths) {
  const electronBuilderDir = resolvePackageDirectory("electron-builder", searchPaths);
  const electronBuilderRequire = createRequire(path.join(fs.realpathSync(electronBuilderDir), "package.json"));
  return path.dirname(electronBuilderRequire.resolve("app-builder-lib/package.json"));
}

function stableHoistedPackageDirectory(appDir, packageName) {
  return path.join(appDir, "node_modules", ...packageName.split("/"));
}

function assertStableHoistedPackage(appDir, packageName) {
  const stablePackageDir = stableHoistedPackageDirectory(appDir, packageName);
  assertExists(stablePackageDir, `stable hoisted ${packageName} package`);
  const resolvedPackageDir = resolvePackageDirectory(packageName, [appDir]);
  const resolvedStableDir = assertPathWithinDirectory(stablePackageDir, appDir, `${packageName} package`);
  const resolvedByNode = assertPathWithinDirectory(resolvedPackageDir, appDir, `${packageName} resolved package`);
  if (resolvedStableDir !== resolvedByNode) {
    throw new Error(`${packageName} did not resolve from its stable hoisted location ${stablePackageDir}.`);
  }
  return stablePackageDir;
}

function expectedSharpPlatformPackages(platform, arch) {
  if (platform === "mac") {
    return [`@img/sharp-darwin-${arch}`, `@img/sharp-libvips-darwin-${arch}`];
  }
  return [`@img/sharp-win32-${arch}`];
}

function readPackageVersion(packageDir, packageName) {
  const packageJsonPath = path.join(packageDir, "package.json");
  assertExists(packageJsonPath, `${packageName} package.json`);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (packageJson.name !== packageName || typeof packageJson.version !== "string") {
    throw new Error(`Invalid staged package metadata for ${packageName} at ${packageJsonPath}.`);
  }
  return packageJson.version;
}

function collectNativeVersions(appDir, platform, arch) {
  const packageNames = [
    "better-sqlite3",
    "sharp",
    "@prisma/client",
    ...expectedSharpPlatformPackages(platform, arch),
  ];
  const versions = {};

  for (const packageName of packageNames) {
    const packageDir = assertStableHoistedPackage(appDir, packageName);
    versions[packageName] = readPackageVersion(packageDir, packageName);
  }

  const generatedPrismaEntry = path.join(appDir, "node_modules", ".prisma", "client", "default.js");
  assertExists(generatedPrismaEntry, "stable hoisted generated Prisma client");
  assertPathWithinDirectory(generatedPrismaEntry, appDir, "Generated Prisma client");
  return versions;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function hashNamedFiles(files) {
  return Object.fromEntries(
    Object.entries(files).map(([name, filePath]) => [name, sha256File(filePath)]),
  );
}

function assertNamedFileHashesUnchanged(before, after, description) {
  for (const name of Object.keys(before)) {
    if (before[name] !== after[name]) {
      throw new Error(`${description} ${name} changed unexpectedly.`);
    }
  }
}

function resolveDesktopReleaseContract({ repoRoot, desktopDir, platform, mode, env = process.env }) {
  const desktopPackageJson = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
  const releaseContract = resolveReleaseContract({
    mode,
    platform,
    version: desktopPackageJson.version,
    env,
    repoRoot,
    allowOriginFallback: false,
  });

  if (
    mode === "verify"
    && (
      releaseContract.updatesEnabled !== false
      || releaseContract.publishFeed !== false
      || releaseContract.updateChannel !== "disabled"
    )
  ) {
    throw new Error("Verify desktop packages must have updates and update-feed publication disabled.");
  }
  return releaseContract;
}

function assertReleaseArtifactsMatch(resourcesDir, releaseContract) {
  const releaseContractPath = path.join(resourcesDir, "release-contract.json");
  const appUpdateConfigPath = path.join(resourcesDir, "app-update.yml");
  const expectedMetadata = createPackageReleaseMetadata(releaseContract);

  assertExists(releaseContractPath, "packaged desktop release metadata");
  const actualMetadata = JSON.parse(fs.readFileSync(releaseContractPath, "utf8"));
  if (JSON.stringify(actualMetadata) !== JSON.stringify(expectedMetadata)) {
    throw new Error("Staged release-contract.json does not match the resolved desktop release contract.");
  }

  if (releaseContract.updatesEnabled) {
    assertExists(appUpdateConfigPath, "desktop updater configuration");
    if (fs.readFileSync(appUpdateConfigPath, "utf8") !== renderAppUpdateConfig(releaseContract)) {
      throw new Error("Staged updater configuration does not match the resolved desktop release contract.");
    }
  } else if (fs.existsSync(appUpdateConfigPath)) {
    throw new Error("app-update.yml must not exist when the desktop release contract disables updates.");
  }
}

function assertExactToolchain(repoRoot, desktopDir) {
  const rootPackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const desktopPackageJson = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
  if (rootPackageJson.packageManager !== EXPECTED_PACKAGE_MANAGER) {
    throw new Error(`Expected packageManager ${EXPECTED_PACKAGE_MANAGER}, found ${rootPackageJson.packageManager || "<missing>"}.`);
  }
  if (desktopPackageJson.packageManager !== EXPECTED_PACKAGE_MANAGER) {
    throw new Error(
      `Desktop packageManager must be pinned to ${EXPECTED_PACKAGE_MANAGER}, found ${desktopPackageJson.packageManager || "<missing>"}.`,
    );
  }
  if (desktopPackageJson.devDependencies?.electron !== EXPECTED_ELECTRON_VERSION) {
    throw new Error(`Electron must be pinned exactly to ${EXPECTED_ELECTRON_VERSION}.`);
  }
  if (desktopPackageJson.devDependencies?.["electron-builder"] !== EXPECTED_ELECTRON_BUILDER_VERSION) {
    throw new Error(`electron-builder must be pinned exactly to ${EXPECTED_ELECTRON_BUILDER_VERSION}.`);
  }

  for (const [packageName, expectedVersion] of [
    ["electron", EXPECTED_ELECTRON_VERSION],
    ["electron-builder", EXPECTED_ELECTRON_BUILDER_VERSION],
  ]) {
    const packageDir = resolvePackageDirectory(packageName, [desktopDir, repoRoot]);
    const installedVersion = readPackageVersion(packageDir, packageName);
    if (installedVersion !== expectedVersion) {
      throw new Error(`Expected installed ${packageName}@${expectedVersion}, found ${installedVersion}.`);
    }
  }
  const appBuilderLibDir = resolveAppBuilderLibDirectory([desktopDir, repoRoot]);
  const appBuilderLibVersion = readPackageVersion(appBuilderLibDir, "app-builder-lib");
  if (appBuilderLibVersion !== EXPECTED_ELECTRON_BUILDER_VERSION) {
    throw new Error(
      `Expected installed app-builder-lib@${EXPECTED_ELECTRON_BUILDER_VERSION}, found ${appBuilderLibVersion}.`,
    );
  }
}

function buildStageManifest({ repoRoot, desktopDir, appDir, resourcesDir, platform, arch, mode, releaseContract }) {
  const desktopPackageJson = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
  const stagedPackageJson = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf8"));

  if (stagedPackageJson.name !== desktopPackageJson.name || stagedPackageJson.version !== desktopPackageJson.version) {
    throw new Error("Staged desktop package identity does not match desktop/package.json.");
  }
  if (
    !releaseContract
    || releaseContract.mode !== mode
    || releaseContract.platform !== platform
    || releaseContract.version !== desktopPackageJson.version
  ) {
    throw new Error("Resolved desktop release contract does not match the requested stage identity.");
  }
  assertReleaseArtifactsMatch(resourcesDir, releaseContract);

  return {
    schemaVersion: STAGE_MANIFEST_VERSION,
    os: platform,
    arch,
    mode,
    host: {
      os: hostPlatform(),
      arch: process.arch,
    },
    app: {
      name: desktopPackageJson.name,
      version: desktopPackageJson.version,
    },
    electron: {
      version: EXPECTED_ELECTRON_VERSION,
    },
    nativeVersions: collectNativeVersions(appDir, platform, arch),
    lock: {
      file: "pnpm-lock.yaml",
      sha256: sha256File(path.join(repoRoot, "pnpm-lock.yaml")),
    },
    releaseContract,
  };
}

function assertStageManifestMatches(manifestPath, expectedManifest) {
  assertExists(manifestPath, "desktop stage manifest");
  const actualManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const expectedSource = JSON.stringify(expectedManifest);
  const actualSource = JSON.stringify(actualManifest);
  if (actualSource !== expectedSource) {
    throw new Error(
      `Staged app cannot be reused because stage-manifest.json does not fully match the requested build.\nExpected: ${JSON.stringify(expectedManifest, null, 2)}\nActual: ${JSON.stringify(actualManifest, null, 2)}`,
    );
  }
}

module.exports = {
  EXPECTED_ELECTRON_BUILDER_VERSION,
  EXPECTED_ELECTRON_VERSION,
  assertAllSymlinksWithinDirectory,
  assertExactToolchain,
  assertExists,
  assertNamedFileHashesUnchanged,
  assertNativeTargetMatchesHost,
  assertPathWithinDirectory,
  assertReleaseArtifactsMatch,
  assertStableHoistedPackage,
  assertStageManifestMatches,
  buildStageManifest,
  expectedSharpPlatformPackages,
  hashNamedFiles,
  parseBuilderCli,
  parseStageCli,
  resolveDesktopReleaseContract,
  resolveAppBuilderLibDirectory,
  resolvePackageDirectory,
  stableHoistedPackageDirectory,
};
