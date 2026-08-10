const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const desktopDir = path.resolve(__dirname, "..");
const electronBuilderPackageJson = require.resolve("electron-builder/package.json", { paths: [desktopDir] });
const electronBuilderRequire = createRequire(electronBuilderPackageJson);
const asar = electronBuilderRequire("@electron/asar");
const VALID_PLATFORMS = new Set(["win", "mac"]);
const VALID_ARCHES = new Set(["x64", "arm64"]);
const VALID_MODES = new Set(["verify", "beta", "stable"]);

function parseCli(args) {
  const allowed = new Set(["--platform", "--arch", "--mode"]);
  const values = {};
  if (args.length % 2 !== 0) {
    throw new Error("Every package verifier option requires exactly one value.");
  }
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!allowed.has(option)) {
      throw new Error(`Unknown package verifier option: ${option || "<missing>"}.`);
    }
    if (Object.prototype.hasOwnProperty.call(values, option)) {
      throw new Error(`Duplicate package verifier option: ${option}.`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`${option} requires exactly one value.`);
    }
    values[option] = value;
  }
  for (const option of allowed) {
    if (!Object.prototype.hasOwnProperty.call(values, option)) {
      throw new Error(`Missing required package verifier option: ${option}.`);
    }
  }
  if (!VALID_PLATFORMS.has(values["--platform"])) {
    throw new Error("--platform must be win or mac.");
  }
  if (!VALID_ARCHES.has(values["--arch"])) {
    throw new Error("--arch must be x64 or arm64.");
  }
  if (!VALID_MODES.has(values["--mode"])) {
    throw new Error("--mode must be verify, beta, or stable.");
  }
  return {
    platform: values["--platform"],
    arch: values["--arch"],
    mode: values["--mode"],
  };
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

function findSingleDirectory(parentDir, suffix, description) {
  assertExists(parentDir, `${description} parent directory`);
  const matches = fs.readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(suffix))
    .map((entry) => path.join(parentDir, entry.name));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${description} under ${parentDir}, found ${matches.length}.`);
  }
  return matches[0];
}

function resolvePackagedLayout(options, baseDesktopDir = desktopDir) {
  const distDir = path.join(baseDesktopDir, "build", "dist");
  if (options.platform === "win") {
    const candidates = [
      path.join(distDir, "win-unpacked"),
      path.join(distDir, `win-${options.arch}-unpacked`),
    ].filter((candidate, index, list) => list.indexOf(candidate) === index && fs.existsSync(candidate));
    if (candidates.length !== 1) {
      throw new Error(`Expected one unpacked Windows package for ${options.arch}, found ${candidates.length}.`);
    }
    const packageRoot = candidates[0];
    return {
      packageRoot,
      resourcesDir: path.join(packageRoot, "resources"),
      platformIcon: path.join(packageRoot, "resources", "icons", "app-icon.ico"),
    };
  }

  const macOutputDir = path.join(distDir, options.arch === "x64" ? "mac" : `mac-${options.arch}`);
  const appBundleDir = findSingleDirectory(macOutputDir, ".app", "macOS .app bundle");
  return {
    packageRoot: appBundleDir,
    resourcesDir: path.join(appBundleDir, "Contents", "Resources"),
    platformIcon: path.join(appBundleDir, "Contents", "Resources", "icon.icns"),
  };
}

function normalizeAsarEntry(entry) {
  return entry.replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

function assertSomeMatch(entries, pattern, description) {
  if (!entries.some((entry) => pattern.test(entry))) {
    throw new Error(`Packaged app is missing ${description}.`);
  }
}

function listFilesRecursive(rootDir) {
  const files = [];
  const pending = [rootDir];
  while (pending.length > 0) {
    const currentDir = pending.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(rootDir, entryPath).split(path.sep).join("/"));
      }
    }
  }
  return files;
}

function readJson(filePath, description) {
  assertExists(filePath, description);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${description} at ${filePath}: ${error instanceof Error ? error.message : error}`);
  }
}

function verifyRendererResources(resourcesDir) {
  const rendererDir = path.join(resourcesDir, "client", "dist");
  const rendererEntry = path.join(rendererDir, "index.html");
  assertExists(rendererEntry, "packaged renderer entry");
  const source = fs.readFileSync(rendererEntry, "utf8");
  if (/\b(?:src|href)=["']\/(?!\/)/i.test(source)) {
    throw new Error("Packaged renderer contains an absolute root asset reference.");
  }
  for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
    const reference = match[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(reference)) {
      continue;
    }
    const relativeReference = reference.split(/[?#]/, 1)[0].replace(/^\.\//, "");
    if (relativeReference) {
      assertExists(path.join(rendererDir, relativeReference), `renderer asset ${reference}`);
    }
  }
  return rendererEntry;
}

function verifyReleaseResources({ resourcesDir, appPackageMetadata, stageManifest, options, baseDesktopDir = desktopDir }) {
  const stagedMetadataPath = path.join(baseDesktopDir, "build", "resources", "release-contract.json");
  const packagedMetadataPath = path.join(resourcesDir, "release-contract.json");
  const stagedMetadata = readJson(stagedMetadataPath, "staged release metadata");
  const packagedMetadata = readJson(packagedMetadataPath, "packaged release metadata");
  if (JSON.stringify(stagedMetadata) !== JSON.stringify(packagedMetadata)) {
    throw new Error("Packaged release metadata does not match the staged release metadata.");
  }
  if (JSON.stringify(appPackageMetadata.aiNovelRelease) !== JSON.stringify(packagedMetadata)) {
    throw new Error("app.asar package metadata does not match release-contract.json.");
  }
  if (
    packagedMetadata.releaseMode !== options.mode
    || stageManifest.releaseContract?.mode !== options.mode
    || stageManifest.releaseContract?.platform !== options.platform
  ) {
    throw new Error("Packaged release metadata does not match the requested verifier mode and platform.");
  }

  const updaterConfigPath = path.join(resourcesDir, "app-update.yml");
  if (packagedMetadata.updatesEnabled) {
    assertExists(updaterConfigPath, "packaged updater configuration");
    const updaterSource = fs.readFileSync(updaterConfigPath, "utf8");
    if (!updaterSource.includes("provider: github") || !updaterSource.includes(`channel: ${packagedMetadata.updateChannel}`)) {
      throw new Error("Packaged updater configuration does not match release metadata.");
    }
  } else {
    assertNotExists(updaterConfigPath, "packaged updater configuration while updates are disabled");
  }
  if (
    options.mode === "verify"
    && (packagedMetadata.updatesEnabled !== false || packagedMetadata.updateChannel !== "disabled")
  ) {
    throw new Error("Verify packages must have updates disabled.");
  }
  return packagedMetadata;
}

function verifyNativeUnpacked(resourcesDir, options) {
  const unpackedDir = path.join(resourcesDir, "app.asar.unpacked");
  assertExists(unpackedDir, "app.asar.unpacked directory");
  const unpackedFiles = listFilesRecursive(unpackedDir);
  assertSomeMatch(
    unpackedFiles,
    /^node_modules\/better-sqlite3\/build\/Release\/better_sqlite3\.node$/,
    "unpacked better-sqlite3 native binary",
  );
  const sharpPlatform = options.platform === "mac" ? "darwin" : "win32";
  const sharpPackagePrefix = `node_modules/@img/sharp-${sharpPlatform}-${options.arch}/`;
  assertSomeMatch(
    unpackedFiles,
    new RegExp(`^${sharpPackagePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*\\.node$`),
    `unpacked Sharp ${sharpPlatform}-${options.arch} native binary`,
  );
  if (options.platform === "mac") {
    assertSomeMatch(
      unpackedFiles,
      new RegExp(`^node_modules/@img/sharp-libvips-darwin-${options.arch}/.*\\.dylib$`),
      `unpacked libvips darwin-${options.arch} dynamic library`,
    );
  } else {
    assertSomeMatch(
      unpackedFiles,
      new RegExp(`^${sharpPackagePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*vips.*\\.dll$`, "i"),
      `unpacked libvips win32-${options.arch} dynamic library`,
    );
  }
  return unpackedFiles;
}

function verifyDesktopPackage(options, baseDesktopDir = desktopDir) {
  const layout = resolvePackagedLayout(options, baseDesktopDir);
  const appArchive = path.join(layout.resourcesDir, "app.asar");
  const stageManifest = readJson(
    path.join(baseDesktopDir, "build", "stage-manifest.json"),
    "desktop stage manifest",
  );
  assertExists(layout.platformIcon, "packaged platform icon");
  assertExists(path.join(layout.resourcesDir, "icons", "app-icon.ico"), "packaged Windows icon resource");
  assertExists(path.join(layout.resourcesDir, "icons", "app-icon.png"), "packaged macOS icon resource");
  verifyRendererResources(layout.resourcesDir);
  assertExists(appArchive, "packaged app.asar");

  const packagedEntries = asar.listPackage(appArchive).map(normalizeAsarEntry);
  for (const [pattern, description] of [
    [/^dist\/main\.js$/, "desktop main entry"],
    [/^dist\/preload\.js$/, "desktop preload entry"],
    [/^dist\/runtime\/server\.js$/, "desktop embedded-server runtime"],
    [/^dist\/runtime\/packageSmoke\.js$/, "packaged Electron smoke runtime"],
    [/^node_modules\/@ai-novel\/server\/dist\/app\.js$/, "embedded server entry"],
    [/^node_modules\/@ai-novel\/server\/src\/prisma\/migrations(?:\.sqlite)?\/[^/]+\/migration\.sql$/, "SQLite migration files"],
    [/^node_modules\/@prisma\/client\/generated-client\/default\.js$/, "generated Prisma client"],
    [/^node_modules\/@prisma\/client\/default\.js$/, "Prisma client entrypoint"],
    [/^node_modules\/sharp\/dist\/index\.cjs$/, "Sharp JavaScript entrypoint"],
  ]) {
    assertSomeMatch(packagedEntries, pattern, description);
  }
  if (packagedEntries.some((entry) => /^node_modules\/electron(?:\/|$)/.test(entry))) {
    throw new Error("Electron must not be bundled inside app.asar node_modules.");
  }

  const appPackageMetadata = JSON.parse(asar.extractFile(appArchive, "package.json").toString("utf8"));
  if (appPackageMetadata.dependencies?.electron) {
    throw new Error("Electron must not be an application dependency in packaged metadata.");
  }
  if (appPackageMetadata.version !== stageManifest.app?.version) {
    throw new Error("Packaged app version does not match the stage manifest.");
  }
  const releaseMetadata = verifyReleaseResources({
    resourcesDir: layout.resourcesDir,
    appPackageMetadata,
    stageManifest,
    options,
    baseDesktopDir,
  });
  const unpackedFiles = verifyNativeUnpacked(layout.resourcesDir, options);

  return {
    platform: options.platform,
    arch: options.arch,
    mode: options.mode,
    packageRoot: layout.packageRoot,
    asarEntries: packagedEntries.length,
    unpackedFiles: unpackedFiles.length,
    releaseMetadata,
  };
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const result = verifyDesktopPackage(options);
  console.log(JSON.stringify({ ok: true, ...result }));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("[verify:desktop-package] failed.", error);
    process.exit(1);
  }
}

module.exports = {
  normalizeAsarEntry,
  parseCli,
  resolvePackagedLayout,
  verifyDesktopPackage,
  verifyNativeUnpacked,
  verifyReleaseResources,
  verifyRendererResources,
};
