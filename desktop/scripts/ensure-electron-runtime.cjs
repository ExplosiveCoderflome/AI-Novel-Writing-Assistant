const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..");
const shouldInstall = process.argv.includes("--install");

function resolveElectronPackageDir() {
  const electronPackageJson = require.resolve("electron/package.json", {
    paths: [desktopDir, repoRoot],
  });
  return path.dirname(electronPackageJson);
}

function resolveElectronBinaryPath(electronPackageDir) {
  switch (process.platform) {
    case "win32":
      return path.join(electronPackageDir, "dist", "electron.exe");
    case "darwin":
      return path.join(electronPackageDir, "dist", "Electron.app", "Contents", "MacOS", "Electron");
    default:
      return path.join(electronPackageDir, "dist", "electron");
  }
}

function assertElectronDependencyInstalled() {
  try {
    return resolveElectronPackageDir();
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") {
      console.error("Electron dependency is missing. Run `pnpm install` in the repo root first.");
      process.exit(1);
    }
    throw error;
  }
}

function installElectronRuntime(electronPackageDir) {
  const installScript = path.join(electronPackageDir, "install.js");

  if (!fs.existsSync(installScript)) {
    throw new Error(`Electron install script was not found at ${installScript}.`);
  }

  console.log("Electron runtime is missing. Downloading the desktop runtime now...");
  execFileSync(process.execPath, [installScript], {
    cwd: electronPackageDir,
    env: process.env,
    stdio: "inherit",
  });
}

function main() {
  const electronPackageDir = assertElectronDependencyInstalled();
  const electronBinaryPath = resolveElectronBinaryPath(electronPackageDir);

  if (fs.existsSync(electronBinaryPath)) {
    return;
  }

  if (!shouldInstall) {
    console.error("Electron runtime has not been downloaded yet.");
    console.error("Run `pnpm run prepare:desktop-runtime` from the repo root to fetch it when you need desktop development.");
    process.exit(1);
  }

  installElectronRuntime(electronPackageDir);

  if (!fs.existsSync(electronBinaryPath)) {
    throw new Error(`Electron runtime download finished, but ${electronBinaryPath} is still missing.`);
  }
}

main();
