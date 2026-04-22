const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const distDir = path.join(repoRoot, "desktop", "build", "dist");
const smokeRoot = path.join(repoRoot, "desktop", "build", "installer-smoke");
const installDir = path.join(smokeRoot, "install");
const dataDir = path.join(smokeRoot, "data");
const markerFile = path.join(dataDir, "retained-marker.txt");
const expectedExeName = "AI Novel Writing Assistant v2.exe";
const desktopShortcutDir = path.join(process.env.USERPROFILE || "", "Desktop");
const startMenuProgramsDir = path.join(
  process.env.APPDATA || "",
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
);

function ensureCleanDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function findNewestMatchingFile(directory, predicate) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => ({
      path: path.join(directory, entry.name),
      mtimeMs: fs.statSync(path.join(directory, entry.name)).mtimeMs,
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (entries.length === 0) {
    throw new Error(`No matching file was found in ${directory}.`);
  }

  return entries[0].path;
}

function spawnAndWait(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      windowsHide: false,
      ...options,
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

async function waitForPath(targetPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(targetPath)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for path ${targetPath}.`);
}

async function waitForLogSubstring(logPath, expectedSubstring, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(logPath)) {
      const contents = fs.readFileSync(logPath, "utf8");
      if (contents.includes(expectedSubstring)) {
        return contents;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for "${expectedSubstring}" in ${logPath}.`);
}

function findShortcut(directory, nameFragment) {
  if (!directory || !fs.existsSync(directory)) {
    return null;
  }

  const queue = [directory];
  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) {
      continue;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (entry.name.toLowerCase().includes(nameFragment.toLowerCase()) && entry.name.toLowerCase().endsWith(".lnk")) {
        return entryPath;
      }
    }
  }

  return null;
}

async function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  await spawnAndWait("taskkill", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
  }).catch(() => undefined);
}

async function launchInstalledApp(installedExePath) {
  const child = spawn(installedExePath, [], {
    cwd: installDir,
    windowsHide: false,
    detached: false,
    env: {
      ...process.env,
      AI_NOVEL_APP_DATA_DIR: dataDir,
    },
    stdio: "ignore",
  });

  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });

  return child;
}

async function installSilently(installerPath) {
  ensureCleanDir(installDir);
  ensureDir(dataDir);
  await spawnAndWait(installerPath, ["/S", `/D=${installDir}`], {
    cwd: distDir,
  });
  await waitForPath(path.join(installDir, expectedExeName), 60_000);
}

async function uninstallSilently() {
  const uninstallExecutable = findNewestMatchingFile(installDir, (name) => /^Uninstall .*\.exe$/i.test(name));
  await spawnAndWait(uninstallExecutable, ["/S"], {
    cwd: installDir,
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (!fs.existsSync(path.join(installDir, expectedExeName))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for uninstall to remove ${expectedExeName}.`);
}

async function main() {
  ensureCleanDir(smokeRoot);
  const installerPath = findNewestMatchingFile(distDir, (name) => /setup.*\.exe$/i.test(name) && !name.includes("portable"));
  const installedExePath = path.join(installDir, expectedExeName);
  const logPath = path.join(dataDir, "logs", "desktop-main.log");

  console.log(`[verify:desktop:installer] using installer ${installerPath}`);

  await installSilently(installerPath);
  const desktopShortcut = findShortcut(desktopShortcutDir, "AI Novel Writing Assistant");
  const startMenuShortcut = findShortcut(startMenuProgramsDir, "AI Novel Writing Assistant");

  if (!desktopShortcut) {
    throw new Error("Desktop shortcut was not created by the NSIS installer.");
  }
  if (!startMenuShortcut) {
    throw new Error("Start menu shortcut was not created by the NSIS installer.");
  }

  const firstRun = await launchInstalledApp(installedExePath);
  await waitForLogSubstring(logPath, "main-window-shown", 90_000);
  await waitForLogSubstring(logPath, "Desktop server is healthy", 90_000);
  await killProcessTree(firstRun.pid);

  fs.writeFileSync(markerFile, "retain-desktop-user-data", "utf8");
  await uninstallSilently();

  if (!fs.existsSync(markerFile)) {
    throw new Error("Uninstall unexpectedly removed the retained user data directory.");
  }

  await installSilently(installerPath);
  if (!fs.existsSync(markerFile)) {
    throw new Error("Reinstall did not preserve the existing user data directory.");
  }

  const secondRun = await launchInstalledApp(installedExePath);
  await waitForLogSubstring(logPath, "main-window-shown", 90_000);
  await killProcessTree(secondRun.pid);

  console.log(`[verify:desktop:installer] desktop shortcut: ${desktopShortcut}`);
  console.log(`[verify:desktop:installer] start menu shortcut: ${startMenuShortcut}`);
  console.log(`[verify:desktop:installer] retained data directory: ${dataDir}`);
  console.log("[verify:desktop:installer] silent install/uninstall/reinstall verification passed.");
}

main().catch((error) => {
  console.error("[verify:desktop:installer] failed.", error);
  process.exit(1);
});
