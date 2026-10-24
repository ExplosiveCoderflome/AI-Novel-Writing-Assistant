const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const desktopDir = path.resolve(__dirname, "..");
const buildDir = path.join(desktopDir, "build");
const distDir = path.join(buildDir, "dist");
const smokeRoot = path.join(buildDir, "mac-app-smoke");
const dataDir = path.join(smokeRoot, "data");
const logFile = path.join(dataDir, "logs", "desktop-main.log");
const appProductName = "Biz Novel Studio";
const HEALTH_LOG_PATTERN = /Desktop server is healthy at (http:\/\/127\.0\.0\.1:\d+\/api\/health)/;
const STARTUP_TIMEOUT_MS = 120_000;
const SHUTDOWN_TIMEOUT_MS = 20_000;

function ensureCleanDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function resolveAppBundleDir() {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Desktop dist directory was not found at ${distDir}. Run the packaging step first.`);
  }

  const candidates = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("mac"))
    .map((entry) => path.join(distDir, entry.name, `${appProductName}.app`))
    .filter((appBundleDir) => fs.existsSync(appBundleDir));

  if (candidates.length === 0) {
    throw new Error(`No packaged ${appProductName}.app was found under ${distDir}.`);
  }

  return candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthUrl() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (fs.existsSync(logFile)) {
      const logSource = fs.readFileSync(logFile, "utf8");
      const match = logSource.match(HEALTH_LOG_PATTERN);
      if (match) {
        return match[1];
      }
    }

    await delay(500);
  }

  const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-4_000) : "(no log file yet)";
  throw new Error(`Timed out waiting for the packaged macOS app to report a healthy local server.\n\nLog tail:\n${tail}`);
}

async function assertHealthEndpoint(healthUrl) {
  const response = await fetch(healthUrl);
  if (!response.ok) {
    throw new Error(`Packaged macOS app health check failed with status ${response.status} at ${healthUrl}.`);
  }

  const payload = await response.json().catch(() => null);
  console.log(`[verify:desktop-mac-app] health payload: ${JSON.stringify(payload)}`);
}

function stopApp(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    const killTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, SHUTDOWN_TIMEOUT_MS);

    child.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });

    child.kill("SIGTERM");
  });
}

function resolveLaunchEnvironment(dataDir) {
  const env = {
    ...process.env,
    AI_NOVEL_APP_DATA_DIR: dataDir,
    AI_NOVEL_DESKTOP_DISABLE_UPDATER: "true",
  };

  // ELECTRON_RUN_AS_NODE turns the packaged binary into a plain Node process,
  // which exits immediately and would look like a startup failure here.
  delete env.ELECTRON_RUN_AS_NODE;

  return env;
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("The macOS app smoke check can only run on macOS.");
  }

  const appBundleDir = resolveAppBundleDir();
  const executablePath = path.join(appBundleDir, "Contents", "MacOS", appProductName);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Packaged macOS executable was not found at ${executablePath}.`);
  }

  ensureCleanDir(smokeRoot);
  fs.mkdirSync(dataDir, { recursive: true });

  console.log(`[verify:desktop-mac-app] launching ${appBundleDir}`);
  const child = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    stdio: ["ignore", "pipe", "pipe"],
    env: resolveLaunchEnvironment(dataDir),
  });

  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => output.push(chunk.toString("utf8")));
  child.once("error", (error) => {
    output.push(`spawn error: ${error.message}`);
  });

  try {
    const healthUrl = await waitForHealthUrl();
    await assertHealthEndpoint(healthUrl);
    console.log("[verify:desktop-mac-app] packaged app started its local server successfully.");
  } finally {
    await stopApp(child);
  }

  const databasePath = path.join(dataDir, "data", "dev.db");
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Packaged macOS app did not create its SQLite database at ${databasePath}.`);
  }

  const logSource = fs.readFileSync(logFile, "utf8");
  if (/bootstrap failed|desktop\.main\.bootstrap/.test(logSource)) {
    throw new Error(`Packaged macOS app reported a bootstrap failure.\n\nLog:\n${logSource.slice(-4_000)}`);
  }

  console.log(`[verify:desktop-mac-app] database created at ${databasePath}`);
  console.log(`[verify:desktop-mac-app] logs written to ${logFile}`);
  console.log("[verify:desktop-mac-app] macOS packaged app smoke check passed.");
}

main().catch((error) => {
  console.error("[verify:desktop-mac-app] failed.", error);
  process.exit(1);
});
