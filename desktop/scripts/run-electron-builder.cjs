const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  assertAllSymlinksWithinDirectory,
  assertExactToolchain,
  assertNamedFileHashesUnchanged,
  assertNativeTargetMatchesHost,
  assertStageManifestMatches,
  buildStageManifest,
  hashNamedFiles,
  parseBuilderCli,
  resolveAppBuilderLibDirectory,
} = require("./desktop-stage-contract.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.resolve(__dirname, "..");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const resourcesDir = path.join(buildDir, "resources");
const stageManifestPath = path.join(buildDir, "stage-manifest.json");

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeBuildEnvironment(sourceEnv, options) {
  const env = { ...sourceEnv };
  const allowUnsignedRelease =
    firstNonEmpty(
      env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
      env.AI_NOVEL_ALLOW_UNSIGNED_WINDOWS_RELEASE,
    ).toLowerCase() === "true";
  const signingLink = firstNonEmpty(
    env.CSC_LINK,
    env.WIN_CSC_LINK,
    env.AI_NOVEL_WINDOWS_CSC_LINK,
    env.AI_NOVEL_WINDOWS_CSC_FILE,
  );
  const signingPassword = firstNonEmpty(
    env.CSC_KEY_PASSWORD,
    env.WIN_CSC_KEY_PASSWORD,
    env.AI_NOVEL_WINDOWS_CSC_KEY_PASSWORD,
    env.AI_NOVEL_WINDOWS_CSC_PASSWORD,
  );

  env.AI_NOVEL_TARGET_PLATFORM = options.platform;
  env.AI_NOVEL_RELEASE_CHANNEL = options.mode === "stable" ? "latest" : "beta";
  if (signingLink) {
    env.CSC_LINK = signingLink;
  }
  if (signingPassword) {
    env.CSC_KEY_PASSWORD = signingPassword;
  }

  const hasSigning = Boolean(signingLink);
  if (options.platform === "win" && options.mode === "stable" && !hasSigning && !allowUnsignedRelease) {
    throw new Error(
      "Stable Windows desktop packages require signing material. Provide CSC_LINK/WIN_CSC_LINK, or explicitly allow an unsigned release.",
    );
  }

  console.log(
    `[dist:desktop] platform=${options.platform} arch=${options.arch} mode=${options.mode} target=${options.target} publish=never signing=${hasSigning ? "configured" : allowUnsignedRelease ? "unsigned-opt-in" : "not-configured"}`,
  );
  return env;
}

function resolveElectronBuilderCli() {
  return require.resolve("electron-builder/cli.js", { paths: [desktopDir, repoRoot] });
}

function appBuilderLibFiles() {
  const packageDir = resolveAppBuilderLibDirectory([desktopDir, repoRoot]);
  return {
    nsisUtil: path.join(packageDir, "out", "targets", "nsis", "nsisUtil.js"),
    appFileCopier: path.join(packageDir, "out", "util", "appFileCopier.js"),
  };
}

function longestPathUnder(rootDir) {
  let longestPath = rootDir;
  const pending = [rootDir];
  while (pending.length > 0) {
    const currentDir = pending.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      if (entryPath.length > longestPath.length) {
        longestPath = entryPath;
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }
  return longestPath;
}

function assertWindowsNsisTemplatePathsAreSafe(appBuilderFiles) {
  const appBuilderPackageDir = path.resolve(
    path.dirname(appBuilderFiles.nsisUtil),
    "..",
    "..",
    "..",
  );
  const nsisTemplatesDir = path.join(appBuilderPackageDir, "templates", "nsis");
  const longestTemplatePath = longestPathUnder(nsisTemplatesDir);
  if (longestTemplatePath.length > 240) {
    throw new Error(
      `The longest electron-builder NSIS template path is ${longestTemplatePath.length} characters, exceeding the 240-character safety limit: ${longestTemplatePath}. Move the checkout and pnpm store to a shorter directory (for example C:\\w\\ai-writer), reinstall from the frozen lockfile, and retry.`,
    );
  }
}

function electronBuilderArgs(options) {
  const platformFlag = options.platform === "win" ? "--win" : "--mac";
  const archFlag = options.arch === "x64" ? "--x64" : "--arm64";
  let targetArgs;
  if (options.target === "dir") {
    targetArgs = ["--dir", platformFlag];
  } else if (options.target === "all") {
    targetArgs = options.platform === "win"
      ? [platformFlag, "nsis", "portable"]
      : [platformFlag, "dmg", "zip"];
  } else {
    targetArgs = [platformFlag, options.target];
  }
  return [
    "--config",
    "electron-builder.config.cjs",
    ...targetArgs,
    archFlag,
    "--publish",
    "never",
  ];
}

function main() {
  const options = parseBuilderCli(process.argv.slice(2));
  assertNativeTargetMatchesHost(options);
  assertExactToolchain(repoRoot, desktopDir);
  assertAllSymlinksWithinDirectory(appDir);

  const expectedManifest = buildStageManifest({
    repoRoot,
    desktopDir,
    appDir,
    resourcesDir,
    platform: options.platform,
    arch: options.arch,
    mode: options.mode,
  });
  assertStageManifestMatches(stageManifestPath, expectedManifest);

  const guardedFiles = appBuilderLibFiles();
  if (options.platform === "win") {
    assertWindowsNsisTemplatePathsAreSafe(guardedFiles);
  }
  const hashesBeforeBuild = hashNamedFiles(guardedFiles);
  const buildEnv = normalizeBuildEnvironment(process.env, options);

  try {
    execFileSync(process.execPath, [resolveElectronBuilderCli(), ...electronBuilderArgs(options)], {
      cwd: desktopDir,
      stdio: "inherit",
      env: buildEnv,
    });
  } finally {
    const hashesAfterBuild = hashNamedFiles(guardedFiles);
    assertNamedFileHashesUnchanged(hashesBeforeBuild, hashesAfterBuild, "app-builder-lib");
  }
}

try {
  main();
} catch (error) {
  console.error("[dist:desktop] failed.", error);
  process.exit(1);
}
