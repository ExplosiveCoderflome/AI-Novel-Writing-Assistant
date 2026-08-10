const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  normalizeAsarEntry,
  parseCli,
  resolvePackagedLayout,
  verifyReleaseResources,
  verifyRendererResources,
} = require("./verify-desktop-package.cjs");

function createTemporaryDesktop(t) {
  const baseDesktopDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-package-verifier-test-"));
  t.after(() => fs.rmSync(baseDesktopDir, { recursive: true, force: true }));
  return baseDesktopDir;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("parseCli accepts only the complete strict verifier contract", () => {
  assert.deepEqual(
    parseCli(["--platform", "mac", "--arch", "arm64", "--mode", "verify"]),
    { platform: "mac", arch: "arm64", mode: "verify" },
  );
  assert.throws(() => parseCli(["--platform", "linux", "--arch", "x64", "--mode", "verify"]), /win or mac/);
  assert.throws(() => parseCli(["--platform", "win", "--arch", "ia32", "--mode", "verify"]), /x64 or arm64/);
  assert.throws(() => parseCli(["--platform", "win", "--arch", "x64", "--mode", "release"]), /verify, beta, or stable/);
  assert.throws(() => parseCli(["--platform", "win", "--arch", "x64"]), /Missing required/);
  assert.throws(
    () => parseCli(["--platform", "win", "--arch", "x64", "--mode", "verify", "--mode", "stable"]),
    /Duplicate/,
  );
  assert.throws(
    () => parseCli(["--platform", "win", "--arch", "x64", "--mode", "verify", "--target", "dir"]),
    /Unknown/,
  );
});

test("resolvePackagedLayout resolves Windows resources and rejects ambiguous packages", (t) => {
  const baseDesktopDir = createTemporaryDesktop(t);
  const packageRoot = path.join(baseDesktopDir, "build", "dist", "win-unpacked");
  fs.mkdirSync(packageRoot, { recursive: true });

  assert.deepEqual(resolvePackagedLayout({ platform: "win", arch: "x64" }, baseDesktopDir), {
    packageRoot,
    resourcesDir: path.join(packageRoot, "resources"),
    platformIcon: path.join(packageRoot, "resources", "icons", "app-icon.ico"),
  });

  fs.mkdirSync(path.join(baseDesktopDir, "build", "dist", "win-x64-unpacked"), { recursive: true });
  assert.throws(
    () => resolvePackagedLayout({ platform: "win", arch: "x64" }, baseDesktopDir),
    /Expected one unpacked Windows package.*found 2/,
  );
});

test("resolvePackagedLayout resolves exactly one macOS app bundle", (t) => {
  const baseDesktopDir = createTemporaryDesktop(t);
  const appBundle = path.join(baseDesktopDir, "build", "dist", "mac-arm64", "Writer.app");
  fs.mkdirSync(appBundle, { recursive: true });

  assert.deepEqual(resolvePackagedLayout({ platform: "mac", arch: "arm64" }, baseDesktopDir), {
    packageRoot: appBundle,
    resourcesDir: path.join(appBundle, "Contents", "Resources"),
    platformIcon: path.join(appBundle, "Contents", "Resources", "icon.icns"),
  });

  fs.mkdirSync(path.join(baseDesktopDir, "build", "dist", "mac-arm64", "Second.app"), { recursive: true });
  assert.throws(
    () => resolvePackagedLayout({ platform: "mac", arch: "arm64" }, baseDesktopDir),
    /Expected exactly one macOS \.app bundle.*found 2/,
  );
});

test("resolvePackagedLayout uses electron-builder's default mac directory for x64", (t) => {
  const baseDesktopDir = createTemporaryDesktop(t);
  const appBundle = path.join(baseDesktopDir, "build", "dist", "mac", "Writer.app");
  fs.mkdirSync(appBundle, { recursive: true });
  assert.equal(
    resolvePackagedLayout({ platform: "mac", arch: "x64" }, baseDesktopDir).packageRoot,
    appBundle,
  );
});

test("verifyRendererResources requires relative references that exist", (t) => {
  const resourcesDir = createTemporaryDesktop(t);
  const rendererDir = path.join(resourcesDir, "client", "dist");
  fs.mkdirSync(path.join(rendererDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(rendererDir, "assets", "app.js"), "", "utf8");
  fs.writeFileSync(
    path.join(rendererDir, "index.html"),
    '<!doctype html><script src="./assets/app.js?hash=1"></script>',
    "utf8",
  );
  assert.equal(verifyRendererResources(resourcesDir), path.join(rendererDir, "index.html"));

  fs.writeFileSync(path.join(rendererDir, "index.html"), '<script src="/assets/app.js"></script>', "utf8");
  assert.throws(() => verifyRendererResources(resourcesDir), /absolute root asset reference/);
});

test("verifyReleaseResources enforces disabled updater state for verify packages", (t) => {
  const baseDesktopDir = createTemporaryDesktop(t);
  const resourcesDir = path.join(baseDesktopDir, "package", "resources");
  const releaseMetadata = {
    releaseMode: "verify",
    updateChannel: "disabled",
    updatesEnabled: false,
    signingStatus: "none",
  };
  writeJson(path.join(baseDesktopDir, "build", "resources", "release-contract.json"), releaseMetadata);
  writeJson(path.join(resourcesDir, "release-contract.json"), releaseMetadata);
  const input = {
    resourcesDir,
    appPackageMetadata: { aiNovelRelease: releaseMetadata },
    stageManifest: { releaseContract: { mode: "verify", platform: "mac" } },
    options: { platform: "mac", arch: "arm64", mode: "verify" },
    baseDesktopDir,
  };

  assert.deepEqual(verifyReleaseResources(input), releaseMetadata);
  fs.writeFileSync(path.join(resourcesDir, "app-update.yml"), "provider: github\nchannel: beta\n", "utf8");
  assert.throws(() => verifyReleaseResources(input), /Unexpected packaged updater configuration/);
});

test("verifyReleaseResources requires enabled updater metadata to match the channel", (t) => {
  const baseDesktopDir = createTemporaryDesktop(t);
  const resourcesDir = path.join(baseDesktopDir, "package", "resources");
  const releaseMetadata = {
    releaseMode: "beta",
    updateChannel: "beta",
    updatesEnabled: true,
    signingStatus: "none",
  };
  writeJson(path.join(baseDesktopDir, "build", "resources", "release-contract.json"), releaseMetadata);
  writeJson(path.join(resourcesDir, "release-contract.json"), releaseMetadata);
  fs.writeFileSync(path.join(resourcesDir, "app-update.yml"), "provider: github\nchannel: latest\n", "utf8");
  const input = {
    resourcesDir,
    appPackageMetadata: { aiNovelRelease: releaseMetadata },
    stageManifest: { releaseContract: { mode: "beta", platform: "win" } },
    options: { platform: "win", arch: "x64", mode: "beta" },
    baseDesktopDir,
  };

  assert.throws(() => verifyReleaseResources(input), /does not match release metadata/);
  fs.writeFileSync(path.join(resourcesDir, "app-update.yml"), "provider: github\nchannel: beta\n", "utf8");
  assert.deepEqual(verifyReleaseResources(input), releaseMetadata);
});

test("normalizeAsarEntry handles Windows and POSIX archive separators", () => {
  assert.equal(normalizeAsarEntry("\\dist\\main.js"), "dist/main.js");
  assert.equal(normalizeAsarEntry("/dist/runtime/server.js"), "dist/runtime/server.js");
});
