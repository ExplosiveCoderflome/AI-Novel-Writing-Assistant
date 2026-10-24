const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.resolve(__dirname, "..");
const nsisEnvOverrideName = "AI_NOVEL_EB_NSIS_TEMPLATES_DIR";
const traversalEnvOverrideName = "AI_NOVEL_EB_FORCE_TRAVERSAL";
const nsisUtilOriginal = 'exports.nsisTemplatesDir = (0, pathManager_1.getTemplatePath)("nsis");';
const nsisUtilPatched =
  'exports.nsisTemplatesDir = process.env.AI_NOVEL_EB_NSIS_TEMPLATES_DIR && process.env.AI_NOVEL_EB_NSIS_TEMPLATES_DIR.trim() ? path.resolve(process.env.AI_NOVEL_EB_NSIS_TEMPLATES_DIR.trim()) : (0, pathManager_1.getTemplatePath)("nsis");';
const appFileCopierOriginal = 'const pmApproaches = [await packager.getPackageManager(), node_module_collector_1.PM.TRAVERSAL];';
const appFileCopierPatched =
  'const pmApproaches = process.env.AI_NOVEL_EB_FORCE_TRAVERSAL === "true" ? [node_module_collector_1.PM.TRAVERSAL] : [await packager.getPackageManager(), node_module_collector_1.PM.TRAVERSAL];';
const electronBuilderPackageJson = require.resolve("electron-builder/package.json", { paths: [desktopDir, repoRoot] });
const electronBuilderRequire = createRequire(electronBuilderPackageJson);

function resolveModule(request) {
  try {
    return require.resolve(request, { paths: [desktopDir, repoRoot] });
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") {
      return electronBuilderRequire.resolve(request);
    }
    throw error;
  }
}

function patchFileInPlace(moduleRequest, originalSource, patchedSource, description) {
  const modulePath = resolveModule(moduleRequest);
  const targets = new Set([modulePath, fs.realpathSync(modulePath)]);

  for (const targetPath of targets) {
    const source = fs.readFileSync(targetPath, "utf8");

    if (source.includes(patchedSource)) {
      continue;
    }

    if (!source.includes(originalSource)) {
      throw new Error(`Unable to patch electron-builder ${description} at ${targetPath}. Expected marker was not found.`);
    }

    fs.writeFileSync(targetPath, source.replace(originalSource, patchedSource), "utf8");
  }
}

function ensurePatchedElectronBuilder() {
  patchFileInPlace(
    "app-builder-lib/out/targets/nsis/nsisUtil.js",
    nsisUtilOriginal,
    nsisUtilPatched,
    "NSIS util",
  );
  patchFileInPlace(
    "app-builder-lib/out/util/appFileCopier.js",
    appFileCopierOriginal,
    appFileCopierPatched,
    "app file copier",
  );
}

function resolveShortNsisTemplateDir() {
  const installerTemplate = resolveModule("app-builder-lib/templates/nsis/installer.nsi");
  const templatesDir = path.dirname(installerTemplate);
  const mirroredTemplatesRoot = path.join(desktopDir, "build", "electron-builder-templates");
  const mirroredNsisTemplatesDir = path.join(mirroredTemplatesRoot, "nsis");

  if (!fs.existsSync(templatesDir)) {
    throw new Error(`NSIS template directory was not found at ${templatesDir}.`);
  }

  fs.rmSync(mirroredNsisTemplatesDir, { recursive: true, force: true });
  fs.mkdirSync(mirroredTemplatesRoot, { recursive: true });
  fs.cpSync(templatesDir, mirroredNsisTemplatesDir, { recursive: true, force: true });

  return mirroredNsisTemplatesDir;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function detectRequestedPlatforms(args) {
  const platforms = new Set();

  for (const rawArg of args) {
    const arg = rawArg.replace(/^--?/, "").toLowerCase();
    if (arg === "win" || arg === "windows") {
      platforms.add("win");
    } else if (arg === "mac" || arg === "macos" || arg === "darwin") {
      platforms.add("mac");
    } else if (arg === "linux") {
      platforms.add("linux");
    }
  }

  if (platforms.size === 0) {
    platforms.add(process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux");
  }

  return platforms;
}

function resolveNotarizationConfigured(env) {
  return Boolean(
    firstNonEmpty(env.APPLE_KEYCHAIN_PROFILE) ||
      (firstNonEmpty(env.APPLE_API_KEY) &&
        firstNonEmpty(env.APPLE_API_KEY_ID) &&
        firstNonEmpty(env.APPLE_API_ISSUER)) ||
      (firstNonEmpty(env.APPLE_ID) &&
        firstNonEmpty(env.APPLE_APP_SPECIFIC_PASSWORD) &&
        firstNonEmpty(env.APPLE_TEAM_ID)),
  );
}

function normalizeBuildEnvironment(sourceEnv, args) {
  const env = { ...sourceEnv };
  const releaseChannel = firstNonEmpty(env.AI_NOVEL_RELEASE_CHANNEL, "beta").toLowerCase();
  const isPublishRequested = args.includes("--publish");
  const platforms = detectRequestedPlatforms(args);
  const buildsWindows = platforms.has("win");
  const buildsMac = platforms.has("mac");
  const allowUnsignedWindowsRelease =
    firstNonEmpty(
      env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
      env.AI_NOVEL_ALLOW_UNSIGNED_WINDOWS_RELEASE,
    ).toLowerCase() === "true";
  const allowUnsignedMacRelease =
    firstNonEmpty(
      env.AI_NOVEL_ALLOW_UNSIGNED_MAC_RELEASE,
      env.AI_NOVEL_ALLOW_UNSIGNED_RELEASE,
    ).toLowerCase() === "true";

  const windowsSigningLink = firstNonEmpty(
    env.WIN_CSC_LINK,
    env.AI_NOVEL_WINDOWS_CSC_LINK,
    env.AI_NOVEL_WINDOWS_CSC_FILE,
  );
  const windowsSigningPassword = firstNonEmpty(
    env.WIN_CSC_KEY_PASSWORD,
    env.AI_NOVEL_WINDOWS_CSC_KEY_PASSWORD,
    env.AI_NOVEL_WINDOWS_CSC_PASSWORD,
  );
  const macSigningLink = firstNonEmpty(
    env.MAC_CSC_LINK,
    env.AI_NOVEL_MAC_CSC_LINK,
    env.AI_NOVEL_MAC_CSC_FILE,
  );
  const macSigningPassword = firstNonEmpty(
    env.MAC_CSC_KEY_PASSWORD,
    env.AI_NOVEL_MAC_CSC_KEY_PASSWORD,
    env.AI_NOVEL_MAC_CSC_PASSWORD,
  );
  const githubToken = firstNonEmpty(env.GH_TOKEN, env.GITHUB_TOKEN, env.AI_NOVEL_GITHUB_TOKEN);

  // electron-builder only reads the generic CSC_* variables, so each platform's
  // dedicated secret slot is mapped onto them for the matching build only. A
  // Windows certificate can therefore never be handed to the macOS signer.
  if (buildsWindows) {
    const signingLink = windowsSigningLink || firstNonEmpty(env.CSC_LINK);
    const signingPassword = windowsSigningPassword || firstNonEmpty(env.CSC_KEY_PASSWORD);
    if (signingLink) {
      env.CSC_LINK = signingLink;
    }
    if (signingPassword) {
      env.CSC_KEY_PASSWORD = signingPassword;
    }
  }

  if (buildsMac) {
    const signingLink = macSigningLink || firstNonEmpty(env.CSC_LINK);
    const signingPassword = macSigningPassword || firstNonEmpty(env.CSC_KEY_PASSWORD);
    if (signingLink) {
      env.CSC_LINK = signingLink;
    }
    if (signingPassword) {
      env.CSC_KEY_PASSWORD = signingPassword;
    }
  }

  if (githubToken) {
    env.GH_TOKEN = githubToken;
  }

  const hasWindowsSigning = Boolean(firstNonEmpty(env.CSC_LINK, windowsSigningLink));
  if (buildsWindows && !releaseChannel.startsWith("beta") && !hasWindowsSigning && !allowUnsignedWindowsRelease) {
    throw new Error(
      "Public Windows desktop releases require signing material. Provide WIN_CSC_LINK/CSC_LINK first, or explicitly allow an unsigned release.",
    );
  }

  const hasMacSigning = Boolean(firstNonEmpty(env.CSC_LINK, macSigningLink));
  const hasMacNotarization = resolveNotarizationConfigured(env);
  if (buildsMac && !releaseChannel.startsWith("beta") && !allowUnsignedMacRelease && !(hasMacSigning && hasMacNotarization)) {
    throw new Error(
      "Public macOS desktop releases require signing and notarization material. Provide MAC_CSC_LINK/MAC_CSC_KEY_PASSWORD plus APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID (or APPLE_API_KEY credentials), or explicitly allow an unsigned release.",
    );
  }

  if (isPublishRequested && !env.GH_TOKEN) {
    throw new Error("GitHub publish requested but no GH_TOKEN/GITHUB_TOKEN was provided.");
  }

  console.log(
    `[dist:desktop] platforms=${Array.from(platforms).join(",")} releaseChannel=${releaseChannel} publish=${isPublishRequested ? "yes" : "no"} windowsSigning=${hasWindowsSigning ? "configured" : "none"} macSigning=${hasMacSigning ? "configured" : "none"} macNotarization=${hasMacNotarization ? "configured" : "none"}`,
  );

  return env;
}

function main() {
  // The traversal collector patch keeps pnpm's symlinked node_modules layout
  // working on every platform, so it is applied for all builds.
  ensurePatchedElectronBuilder();

  const args = process.argv.slice(2);
  const buildsWindows = detectRequestedPlatforms(args).has("win");
  const electronBuilderCli = resolveModule("electron-builder/cli.js");
  const builderArgs = ["--config", "electron-builder.config.cjs", ...args];
  const env = normalizeBuildEnvironment(process.env, args);
  const extraEnv = {
    [traversalEnvOverrideName]: "true",
  };

  if (buildsWindows) {
    const shortNsisTemplatesDir = resolveShortNsisTemplateDir();
    console.log(`[dist:desktop] using NSIS templates from ${shortNsisTemplatesDir}`);
    extraEnv[nsisEnvOverrideName] = shortNsisTemplatesDir;
  }

  execFileSync(process.execPath, [electronBuilderCli, ...builderArgs], {
    cwd: desktopDir,
    stdio: "inherit",
    env: {
      ...env,
      ...extraEnv,
    },
  });
}

try {
  main();
} catch (error) {
  console.error("[dist:desktop] failed.", error);
  process.exit(1);
}
