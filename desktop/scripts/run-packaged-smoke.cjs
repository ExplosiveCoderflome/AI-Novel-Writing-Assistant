const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  parseCli,
  resolvePackagedLayout,
  verifyDesktopPackage,
} = require("./verify-desktop-package.cjs");

const desktopDir = path.resolve(__dirname, "..");
const SMOKE_TIMEOUT_MS = 120_000;

function resolvePackagedExecutable(options, baseDesktopDir = desktopDir) {
  const layout = resolvePackagedLayout(options, baseDesktopDir);
  const desktopPackageJson = JSON.parse(fs.readFileSync(path.join(baseDesktopDir, "package.json"), "utf8"));
  const productName = desktopPackageJson.productName;
  if (typeof productName !== "string" || !productName.trim()) {
    throw new Error("desktop/package.json must define productName for packaged smoke.");
  }
  const executablePath = options.platform === "win"
    ? path.join(layout.packageRoot, `${productName}.exe`)
    : path.join(layout.packageRoot, "Contents", "MacOS", productName);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Packaged Electron executable is missing: ${executablePath}`);
  }
  return executablePath;
}

function assertSmokeResult(result, options, expectedElectronVersion) {
  if (!result || typeof result !== "object" || result.ok !== true) {
    throw new Error(`Packaged smoke reported failure: ${result?.error || "invalid result"}.`);
  }
  const expectedPlatform = options.platform === "win" ? "win32" : "darwin";
  if (result.platform !== expectedPlatform || result.arch !== options.arch) {
    throw new Error(
      `Packaged smoke ran under ${result.platform}/${result.arch}, expected ${expectedPlatform}/${options.arch}.`,
    );
  }
  if (result.electronVersion !== expectedElectronVersion || !/^\d+$/.test(result.nodeAbi || "")) {
    throw new Error(
      `Packaged smoke did not run under the expected Electron ABI (${expectedElectronVersion}, ABI ${result.nodeAbi || "missing"}).`,
    );
  }
  const expectedChecks = ["betterSqlite3", "sharp", "prisma", "serverHealth", "rendererEntry"];
  for (const checkName of expectedChecks) {
    if (result.checks?.[checkName]?.ok !== true) {
      throw new Error(`Packaged smoke check ${checkName} did not pass.`);
    }
  }
  return result;
}

function runPackagedSmoke(options, baseDesktopDir = desktopDir) {
  verifyDesktopPackage(options, baseDesktopDir);
  const executablePath = resolvePackagedExecutable(options, baseDesktopDir);
  const stageManifest = JSON.parse(
    fs.readFileSync(path.join(baseDesktopDir, "build", "stage-manifest.json"), "utf8"),
  );
  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-packaged-smoke-"));
  const outputPath = path.join(smokeRoot, "result.json");
  const appDataDir = path.join(smokeRoot, "app-data");

  try {
    const execution = spawnSync(
      executablePath,
      ["--package-smoke", "--package-smoke-output", outputPath],
      {
        cwd: path.dirname(executablePath),
        env: {
          ...process.env,
          AI_NOVEL_PACKAGE_SMOKE_ROOT: smokeRoot,
          AI_NOVEL_APP_DATA_DIR: appDataDir,
          AI_NOVEL_DESKTOP_SERVER_MODE: "managed",
          AI_NOVEL_DATABASE_MODE: "sqlite",
          RAG_ENABLED: "false",
        },
        encoding: "utf8",
        timeout: SMOKE_TIMEOUT_MS,
        windowsHide: true,
      },
    );
    if (execution.error) {
      throw execution.error;
    }
    if (!fs.existsSync(outputPath)) {
      const stderrTail = (execution.stderr || "").trim().slice(-2_000);
      throw new Error(`Packaged Electron did not write smoke JSON.${stderrTail ? ` stderr: ${stderrTail}` : ""}`);
    }
    const result = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (execution.status !== 0 && result.ok !== false) {
      throw new Error(`Packaged Electron exited with code ${execution.status}.`);
    }
    return assertSmokeResult(result, options, stageManifest.electron?.version);
  } finally {
    fs.rmSync(smokeRoot, { recursive: true, force: true });
  }
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const result = runPackagedSmoke(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exit(1);
  }
}

module.exports = {
  assertSmokeResult,
  resolvePackagedExecutable,
  runPackagedSmoke,
};
