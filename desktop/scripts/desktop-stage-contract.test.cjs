const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  assertNamedFileHashesUnchanged,
  assertStageManifestMatches,
  buildUpdateConfig,
  hashNamedFiles,
  parseBuilderCli,
  parseStageCli,
} = require("./desktop-stage-contract.cjs");

test("stage and builder CLIs accept only the explicit contract", () => {
  assert.deepEqual(
    parseStageCli(["--platform", "mac", "--arch", "arm64", "--mode", "verify"]),
    { platform: "mac", arch: "arm64", mode: "verify" },
  );
  assert.deepEqual(
    parseBuilderCli([
      "--platform", "win",
      "--arch", "x64",
      "--mode", "beta",
      "--target", "all",
    ]),
    { platform: "win", arch: "x64", mode: "beta", target: "all" },
  );
  assert.throws(() => parseStageCli(["--win", "x64"]), /Unknown or ambiguous option/);
  assert.throws(
    () => parseStageCli(["--platform", "mac", "--arch", "x64", "--mode", "verify"]),
    /supports only win\/x64 and mac\/arm64/,
  );
  assert.throws(
    () => parseBuilderCli([
      "--platform", "win",
      "--arch", "x64",
      "--mode", "beta",
      "--target", "nsis",
      "--publish", "always",
    ]),
    /Publishing is not accepted/,
  );
  assert.throws(
    () => parseBuilderCli([
      "--platform", "mac",
      "--arch", "arm64",
      "--mode", "stable",
      "--target", "nsis",
    ]),
    /Invalid --target/,
  );
});

test("stable update metadata uses the fork and latest channel", () => {
  assert.deepEqual(buildUpdateConfig("stable", {}), {
    provider: "github",
    owner: "yangtzehina",
    repo: "AI-Novel-Writing-Assistant",
    channel: "latest",
    releaseType: "release",
    updaterCacheDirName: "ai-novel-writing-assistant-v2-updater",
    publish: "never",
  });
});

test("reuse requires a byte-for-byte equivalent stage manifest", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-stage-manifest-"));
  const manifestPath = path.join(tempDir, "stage-manifest.json");
  const manifest = { schemaVersion: 1, os: "mac", arch: "arm64", mode: "verify" };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  assert.doesNotThrow(() => assertStageManifestMatches(manifestPath, manifest));
  assert.throws(
    () => assertStageManifestMatches(manifestPath, { ...manifest, mode: "beta" }),
    /does not fully match/,
  );
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("named file hashes detect app-builder-lib mutation", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-builder-hash-"));
  const firstPath = path.join(tempDir, "first.js");
  const secondPath = path.join(tempDir, "second.js");
  const files = { first: firstPath, second: secondPath };
  fs.writeFileSync(firstPath, "first", "utf8");
  fs.writeFileSync(secondPath, "second", "utf8");
  const before = hashNamedFiles(files);
  assert.doesNotThrow(() => assertNamedFileHashesUnchanged(before, hashNamedFiles(files), "app-builder-lib"));
  fs.writeFileSync(secondPath, "changed", "utf8");
  assert.throws(
    () => assertNamedFileHashesUnchanged(before, hashNamedFiles(files), "app-builder-lib"),
    /app-builder-lib second changed unexpectedly/,
  );
  fs.rmSync(tempDir, { recursive: true, force: true });
});
