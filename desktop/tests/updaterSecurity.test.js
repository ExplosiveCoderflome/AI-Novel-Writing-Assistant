const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const updaterRuntime = require("../dist/runtime/updater.js");

test("updater runtime exports security policy helpers", () => {
  assert.equal(typeof updaterRuntime.isTrustedUpdateUrl, "function");
  assert.equal(typeof updaterRuntime.isVersionAllowedByFloor, "function");
  assert.equal(typeof updaterRuntime.validateWindowsPublisher, "function");
});

test("trusted update URLs are restricted to expected GitHub HTTPS hosts", () => {
  assert.equal(
    updaterRuntime.isTrustedUpdateUrl("https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases/download/v0.2.11/latest.yml"),
    true,
  );
  assert.equal(
    updaterRuntime.isTrustedUpdateUrl("https://objects.githubusercontent.com/github-production-release-asset-2e65be/example.exe"),
    true,
  );
  assert.equal(
    updaterRuntime.isTrustedUpdateUrl("https://github-releases.githubusercontent.com/asset/example.exe"),
    true,
  );
  assert.equal(
    updaterRuntime.isTrustedUpdateUrl("http://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases/download/v0.2.11/latest.yml"),
    false,
  );
  assert.equal(
    updaterRuntime.isTrustedUpdateUrl("https://evil.example.com/update.yml"),
    false,
  );
});

test("version floor rejects candidate versions below the minimum safe release", () => {
  assert.equal(updaterRuntime.isVersionAllowedByFloor("0.2.11", "0.2.10"), true);
  assert.equal(updaterRuntime.isVersionAllowedByFloor("0.2.11", "0.2.11"), true);
  assert.equal(updaterRuntime.isVersionAllowedByFloor("0.2.11", "0.2.12"), false);
  assert.equal(updaterRuntime.isVersionAllowedByFloor("0.2.11-beta.1", "0.2.11"), false);
});

test("version floor falls back to allow when no minimum is configured", () => {
  assert.equal(updaterRuntime.isVersionAllowedByFloor("0.2.11", ""), true);
});

test("publisher validation accepts trusted signers and rejects unexpected values", () => {
  assert.equal(
    updaterRuntime.validateWindowsPublisher(["AI Novel Writing Assistant Team"], ["AI Novel Writing Assistant Team"]),
    true,
  );
  assert.equal(
    updaterRuntime.validateWindowsPublisher(["Unexpected Publisher"], ["AI Novel Writing Assistant Team"]),
    false,
  );
  assert.equal(
    updaterRuntime.validateWindowsPublisher([], ["AI Novel Writing Assistant Team"]),
    false,
  );
});

test("public release workflow does not allow unsigned installers", () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, "..", "..", ".github", "workflows", "desktop-release.yml"),
    "utf8",
  );

  assert.ok(!workflow.includes('AI_NOVEL_ALLOW_UNSIGNED_RELEASE: "true"'));
  assert.ok(!workflow.includes('desktop-v*'));
  assert.ok(!workflow.includes("startsWith(github.ref_name, 'desktop-v')"));
  assert.ok(workflow.includes("CSC_LINK: ${{ secrets.WINDOWS_CSC_LINK }}"));
  assert.ok(workflow.includes("CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CSC_KEY_PASSWORD }}"));
});

test("staged updater config persists minimum allowed version for packaged builds", () => {
  const stageScript = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "stage-desktop.cjs"),
    "utf8",
  );
  const runtimePaths = fs.readFileSync(
    path.join(__dirname, "..", "src", "runtime", "paths.ts"),
    "utf8",
  );

  assert.ok(stageScript.includes("minimumAllowedVersion:"));
  assert.ok(runtimePaths.includes("resolveDesktopMinimumUpdateVersion"));
  assert.ok(!runtimePaths.includes("process.env.AI_NOVEL_DESKTOP_MINIMUM_UPDATE_VERSION?.trim() || \"\""));
});
