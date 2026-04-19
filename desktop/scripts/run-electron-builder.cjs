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

function normalizeBuildEnvironment(sourceEnv, args) {
  const env = { ...sourceEnv };
  const releaseChannel = firstNonEmpty(env.AI_NOVEL_RELEASE_CHANNEL, "beta").toLowerCase();
  const isPublishRequested = args.includes("--publish");

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
  const githubToken = firstNonEmpty(env.GH_TOKEN, env.GITHUB_TOKEN, env.AI_NOVEL_GITHUB_TOKEN);

  if (signingLink) {
    env.CSC_LINK = signingLink;
  }
  if (signingPassword) {
    env.CSC_KEY_PASSWORD = signingPassword;
  }
  if (githubToken) {
    env.GH_TOKEN = githubToken;
  }

  const hasSigning = Boolean(signingLink);
  if (!releaseChannel.startsWith("beta") && !hasSigning) {
    throw new Error("Public Windows desktop releases require signing material. Provide CSC_LINK/WIN_CSC_LINK first.");
  }

  if (isPublishRequested && !env.GH_TOKEN) {
    throw new Error("GitHub publish requested but no GH_TOKEN/GITHUB_TOKEN was provided.");
  }

  console.log(
    `[dist:desktop] releaseChannel=${releaseChannel} publish=${isPublishRequested ? "yes" : "no"} signing=${hasSigning ? "configured" : "unsigned-beta"}`,
  );

  return env;
}

function main() {
  ensurePatchedElectronBuilder();

  const shortNsisTemplatesDir = resolveShortNsisTemplateDir();
  const electronBuilderCli = resolveModule("electron-builder/cli.js");
  const args = ["--config", "electron-builder.config.cjs", ...process.argv.slice(2)];
  const env = normalizeBuildEnvironment(process.env, args);

  console.log(`[dist:desktop] using NSIS templates from ${shortNsisTemplatesDir}`);

  execFileSync(process.execPath, [electronBuilderCli, ...args], {
    cwd: desktopDir,
    stdio: "inherit",
    env: {
      ...env,
      [nsisEnvOverrideName]: shortNsisTemplatesDir,
      [traversalEnvOverrideName]: "true",
    },
  });
}

try {
  main();
} catch (error) {
  console.error("[dist:desktop] failed.", error);
  process.exit(1);
}
