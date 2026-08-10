const assert = require("node:assert/strict");
const test = require("node:test");
const {
  resolveDesktopReleaseMetadata,
} = require("../dist/runtime/releaseMetadata.js");
const {
  applyDesktopAutoUpdaterPolicy,
  resolveDesktopUpdaterSupport,
} = require("../dist/runtime/updaterPolicy.js");

function packagedMetadata(aiNovelRelease, version = "1.2.3") {
  return JSON.stringify({ version, aiNovelRelease });
}

function resolveMetadata(aiNovelRelease, overrides = {}) {
  return resolveDesktopReleaseMetadata({
    isPackaged: true,
    appPath: "/virtual/app.asar",
    appVersion: "1.2.3",
    platform: "win32",
    readFile: () => packagedMetadata(aiNovelRelease),
    ...overrides,
  });
}

test("packaged release metadata accepts exact beta/latest contracts", () => {
  assert.deepEqual(resolveMetadata({
    releaseMode: "beta",
    updateChannel: "beta",
    updatesEnabled: true,
    signingStatus: "none",
  }), {
    releaseMode: "beta",
    updateChannel: "beta",
    updatesEnabled: true,
    signingStatus: "none",
    disabledReason: null,
  });
  assert.deepEqual(resolveMetadata({
    releaseMode: "stable",
    updateChannel: "latest",
    updatesEnabled: true,
    signingStatus: "full",
  }), {
    releaseMode: "stable",
    updateChannel: "latest",
    updatesEnabled: true,
    signingStatus: "full",
    disabledReason: null,
  });
});

test("verify, missing, mismatched, and malformed package metadata safely disable updates", () => {
  assert.equal(resolveMetadata({
    releaseMode: "verify",
    updateChannel: "disabled",
    updatesEnabled: false,
    signingStatus: "none",
  }).disabledReason, "verification-build");
  assert.equal(resolveMetadata(undefined).disabledReason, "metadata-invalid");
  assert.equal(resolveMetadata({
    releaseMode: "stable",
    updateChannel: "beta",
    updatesEnabled: true,
    signingStatus: "full",
  }).disabledReason, "metadata-invalid");
  assert.equal(resolveDesktopReleaseMetadata({
    isPackaged: true,
    appPath: "/virtual/app.asar",
    appVersion: "1.2.3",
    platform: "win32",
    readFile: () => packagedMetadata({
      releaseMode: "stable",
      updateChannel: "latest",
      updatesEnabled: true,
      signingStatus: "full",
    }, "1.2.4"),
  }).disabledReason, "version-mismatch");
});

test("unsigned macOS is defensively disabled even when package metadata claims updates are enabled", () => {
  const metadata = resolveMetadata({
    releaseMode: "beta",
    updateChannel: "beta",
    updatesEnabled: true,
    signingStatus: "none",
  }, { platform: "darwin" });
  assert.equal(metadata.updateChannel, "disabled");
  assert.equal(metadata.updatesEnabled, false);
  assert.equal(metadata.disabledReason, "unsigned-macos");

  const support = resolveDesktopUpdaterSupport({
    releaseMetadata: metadata,
    isPackaged: true,
    isPortable: false,
    hasFeedConfig: false,
    disabledByEnvironment: false,
  });
  assert.equal(support.supported, false);
  assert.match(support.message, /Developer ID/);
  assert.match(support.message, /手动下载/);
});

test("updater policy sets the explicit channel and resets downgrade after the channel setter", () => {
  const assignments = [];
  let allowDowngrade = false;
  const updater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    get allowDowngrade() {
      return allowDowngrade;
    },
    set allowDowngrade(value) {
      assignments.push(["allowDowngrade", value]);
      allowDowngrade = value;
    },
    get channel() {
      return null;
    },
    set channel(value) {
      assignments.push(["channel", value]);
      allowDowngrade = true;
    },
  };

  applyDesktopAutoUpdaterPolicy(updater, {
    releaseMode: "beta",
    updateChannel: "beta",
    updatesEnabled: true,
    signingStatus: "none",
    disabledReason: null,
  });

  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, true);
  assert.equal(updater.allowDowngrade, false);
  assert.deepEqual(assignments.slice(-2), [["channel", "beta"], ["allowDowngrade", false]]);
});
