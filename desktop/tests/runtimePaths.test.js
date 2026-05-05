const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const runtimePaths = require("../dist/runtime/paths.js");

test("desktop runtime exposes dedicated session and cache directories under app data", () => {
  assert.equal(typeof runtimePaths.resolveDesktopSessionDataDir, "function");
  assert.equal(typeof runtimePaths.resolveDesktopChromiumCacheDir, "function");

  const previousAppDataDir = process.env.AI_NOVEL_APP_DATA_DIR;
  process.env.AI_NOVEL_APP_DATA_DIR = path.join(process.cwd(), ".tmp", "desktop-runtime-paths-test");

  try {
    const appDataDir = path.resolve(process.env.AI_NOVEL_APP_DATA_DIR);
    assert.equal(runtimePaths.resolveDesktopSessionDataDir(), path.join(appDataDir, "session"));
    assert.equal(runtimePaths.resolveDesktopChromiumCacheDir(), path.join(appDataDir, "cache", "chromium"));
  } finally {
    if (typeof previousAppDataDir === "string") {
      process.env.AI_NOVEL_APP_DATA_DIR = previousAppDataDir;
    } else {
      delete process.env.AI_NOVEL_APP_DATA_DIR;
    }
  }
});
