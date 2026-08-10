const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  ReleaseAssetContractError,
  main,
  parseCliArgs,
  validateReleaseAssets,
} = require("./validate-release-assets.cjs");

const EXPECTED_REPO = "yangtzehina/AI-Novel-Writing-Assistant";
const PRODUCT = "AI Novel Writing Assistant v2";

function fixtureDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-release-assets-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeAsset(directory, name, contents = name) {
  const targetPath = path.join(directory, name);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
  return targetPath;
}

function sha512(filePath) {
  return crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("base64");
}

function updateMetadataSource({
  version,
  channel,
  releaseType,
  entries,
  primaryName,
  owner = "yangtzehina",
  repo = "AI-Novel-Writing-Assistant",
}) {
  return [
    `version: ${version}`,
    "provider: github",
    `owner: ${owner}`,
    `repo: ${repo}`,
    `channel: ${channel}`,
    `releaseType: ${releaseType}`,
    "files:",
    ...entries.flatMap((entry) => [
      `  - url: ${entry.url || entry.name}`,
      `    sha512: ${entry.sha512}`,
      `    size: ${entry.size}`,
    ]),
    `path: ${primaryName}`,
    `sha512: ${entries.find((entry) => entry.name === primaryName).sha512}`,
    "releaseDate: 2026-08-10T00:00:00.000Z",
    "",
  ].join("\n");
}

function addWindowsArtifacts(directory, version, signingStatus) {
  const suffix = signingStatus === "none" ? "-unsigned" : "";
  const setupName = `${PRODUCT}-${version}-setup-x64${suffix}.exe`;
  const portableName = `${PRODUCT}-${version}-portable-x64${suffix}.exe`;
  const setupPath = writeAsset(directory, setupName, `nsis-${version}-${signingStatus}`);
  writeAsset(directory, portableName, `portable-${version}-${signingStatus}`);
  return { setupName, portableName, setupPath };
}

function addMacArtifacts(directory, version, signingStatus) {
  const suffix = signingStatus === "none" ? "-unsigned" : "";
  const dmgName = `${PRODUCT}-${version}-mac-arm64${suffix}.dmg`;
  const zipName = `${PRODUCT}-${version}-mac-arm64${suffix}.zip`;
  const dmgPath = writeAsset(directory, dmgName, `dmg-${version}-${signingStatus}`);
  const zipPath = writeAsset(directory, zipName, `zip-${version}-${signingStatus}`);
  return { dmgName, zipName, dmgPath, zipPath };
}

function addUpdateMetadata(directory, options) {
  const entries = options.assets.map(({ name, filePath, url }) => ({
    name,
    url,
    sha512: sha512(filePath),
    size: fs.statSync(filePath).size,
  }));
  writeAsset(directory, options.fileName, updateMetadataSource({
    version: options.version,
    channel: options.channel,
    releaseType: options.releaseType,
    entries,
    primaryName: options.primaryName,
    owner: options.owner,
    repo: options.repo,
  }));
}

function validate(directory, overrides = {}) {
  return validateReleaseAssets({
    tag: "v1.2.3",
    version: "",
    mode: "",
    platform: "win",
    assetsDir: directory,
    expectedRepo: EXPECTED_REPO,
    signingStatus: "",
    windowsSigningStatus: "",
    macSigningStatus: "",
    ...overrides,
  });
}

function assertContractError(callback, code) {
  assert.throws(callback, (error) => {
    assert.equal(error instanceof ReleaseAssetContractError, true);
    assert.equal(error.code, code);
    return true;
  });
}

test("stable unsigned Windows validates NSIS, portable, latest.yml, SHA-512, and safe manifest", (t) => {
  const directory = fixtureDirectory(t);
  const artifacts = addWindowsArtifacts(directory, "1.2.3", "none");
  addUpdateMetadata(directory, {
    fileName: "latest.yml",
    version: "1.2.3",
    channel: "latest",
    releaseType: "release",
    primaryName: artifacts.setupName,
    assets: [{ name: artifacts.setupName, filePath: artifacts.setupPath }],
  });
  writeAsset(directory, `${artifacts.setupName}.blockmap`, "blockmap");

  const manifest = validate(directory, {
    version: "1.2.3",
    mode: "stable",
    signingStatus: "none",
  });

  assert.equal(manifest.tag, "v1.2.3");
  assert.equal(manifest.mode, "stable");
  assert.equal(manifest.channel, "latest");
  assert.equal(manifest.platforms.win.signingStatus, "none");
  assert.equal(manifest.platforms.win.updatesEnabled, true);
  assert.deepEqual(
    manifest.assets.map((asset) => asset.kind).sort(),
    ["win-update-metadata", "windows-nsis", "windows-nsis-blockmap", "windows-portable"].sort(),
  );
  assert.equal(manifest.updateMetadata[0].primaryAsset, artifacts.setupName);
  assert.match(manifest.updateMetadata[0].downloadUrl, /yangtzehina\/AI-Novel-Writing-Assistant/);
  assert.match(manifest.assets[0].downloadUrl, /AI%20Novel%20Writing%20Assistant%20v2/);
  assert.equal(JSON.stringify(manifest).includes(directory), false);
});

test("beta signed Windows accepts canonical absolute GitHub update URL", (t) => {
  const directory = fixtureDirectory(t);
  const version = "2.0.0-beta.4";
  const tag = `v${version}`;
  const artifacts = addWindowsArtifacts(directory, version, "full");
  const encodedName = encodeURIComponent(artifacts.setupName);
  addUpdateMetadata(directory, {
    fileName: "beta.yml",
    version,
    channel: "beta",
    releaseType: "prerelease",
    primaryName: artifacts.setupName,
    assets: [{
      name: artifacts.setupName,
      filePath: artifacts.setupPath,
      url: `https://github.com/${EXPECTED_REPO}/releases/download/${tag}/${encodedName}`,
    }],
  });

  const manifest = validate(directory, {
    tag,
    version,
    mode: "beta",
    signingStatus: "full",
  });
  assert.equal(manifest.channel, "beta");
  assert.equal(manifest.releaseType, "prerelease");
  assert.equal(manifest.platforms.win.signingStatus, "full");
  assert.equal(manifest.updateMetadata[0].name, "beta.yml");
});

test("unsigned stable macOS requires DMG and ZIP but forbids an update feed", (t) => {
  const directory = fixtureDirectory(t);
  addMacArtifacts(directory, "1.2.3", "none");

  const manifest = validate(directory, {
    platform: "mac",
    signingStatus: "none",
  });

  assert.equal(manifest.platforms.mac.signingStatus, "none");
  assert.equal(manifest.platforms.mac.updatesEnabled, false);
  assert.deepEqual(manifest.updateMetadata, []);
  assert.deepEqual(manifest.assets.map((asset) => asset.kind).sort(), ["mac-dmg", "mac-zip"]);
});

test("signed beta macOS requires beta-mac.yml with matching ZIP and DMG hashes", (t) => {
  const directory = fixtureDirectory(t);
  const version = "1.4.0-beta.2";
  const artifacts = addMacArtifacts(directory, version, "full");
  addUpdateMetadata(directory, {
    fileName: "beta-mac.yml",
    version,
    channel: "beta",
    releaseType: "prerelease",
    primaryName: artifacts.zipName,
    assets: [
      { name: artifacts.zipName, filePath: artifacts.zipPath },
      { name: artifacts.dmgName, filePath: artifacts.dmgPath },
    ],
  });

  const manifest = validate(directory, {
    tag: `v${version}`,
    version,
    mode: "beta",
    platform: "mac",
    signingStatus: "full",
  });
  assert.equal(manifest.platforms.mac.updatesEnabled, true);
  assert.equal(manifest.updateMetadata[0].name, "beta-mac.yml");
  assert.equal(manifest.updateMetadata[0].files.length, 2);
  assert.equal(manifest.updateMetadata[0].primaryAsset, artifacts.zipName);
});

test("signed macOS without channel metadata is blocked", (t) => {
  const directory = fixtureDirectory(t);
  addMacArtifacts(directory, "1.2.3", "full");
  assertContractError(
    () => validate(directory, { platform: "mac", signingStatus: "full" }),
    "UPDATE_METADATA_MISSING",
  );
});

test("unsigned macOS with a feed is blocked", (t) => {
  const directory = fixtureDirectory(t);
  const artifacts = addMacArtifacts(directory, "1.2.3", "none");
  addUpdateMetadata(directory, {
    fileName: "latest-mac.yml",
    version: "1.2.3",
    channel: "latest",
    releaseType: "release",
    primaryName: artifacts.zipName,
    assets: [{ name: artifacts.zipName, filePath: artifacts.zipPath }],
  });
  assertContractError(
    () => validate(directory, { platform: "mac", signingStatus: "none" }),
    "UNSIGNED_MAC_FEED_FORBIDDEN",
  );
});

test("aggregate validation supports unsigned Windows updates and unsigned Mac without a feed", (t) => {
  const directory = fixtureDirectory(t);
  const windows = addWindowsArtifacts(directory, "1.2.3", "none");
  addMacArtifacts(directory, "1.2.3", "none");
  addUpdateMetadata(directory, {
    fileName: "latest.yml",
    version: "1.2.3",
    channel: "latest",
    releaseType: "release",
    primaryName: windows.setupName,
    assets: [{ name: windows.setupName, filePath: windows.setupPath }],
  });

  const manifest = validate(directory, {
    platform: "all",
    windowsSigningStatus: "none",
    macSigningStatus: "none",
  });
  assert.equal(manifest.platforms.win.updatesEnabled, true);
  assert.equal(manifest.platforms.mac.updatesEnabled, false);
  assert.deepEqual(manifest.updateMetadata.map((metadata) => metadata.name), ["latest.yml"]);
});

test("duplicate filenames and mismatched update owner/hash fail closed", async (t) => {
  await t.test("duplicate basename", () => {
    const directory = fixtureDirectory(t);
    const artifacts = addWindowsArtifacts(directory, "1.2.3", "none");
    addUpdateMetadata(directory, {
      fileName: "latest.yml",
      version: "1.2.3",
      channel: "latest",
      releaseType: "release",
      primaryName: artifacts.setupName,
      assets: [{ name: artifacts.setupName, filePath: artifacts.setupPath }],
    });
    writeAsset(path.join(directory, "nested"), artifacts.setupName, "duplicate");
    assertContractError(() => validate(directory), "DUPLICATE_ASSET_NAME");
  });

  await t.test("wrong owner", () => {
    const directory = fixtureDirectory(t);
    const artifacts = addWindowsArtifacts(directory, "1.2.3", "none");
    addUpdateMetadata(directory, {
      fileName: "latest.yml",
      version: "1.2.3",
      channel: "latest",
      releaseType: "release",
      primaryName: artifacts.setupName,
      owner: "someone-else",
      assets: [{ name: artifacts.setupName, filePath: artifacts.setupPath }],
    });
    assertContractError(() => validate(directory), "UPDATE_REPOSITORY_MISMATCH");
  });

  await t.test("wrong hash", () => {
    const directory = fixtureDirectory(t);
    const artifacts = addWindowsArtifacts(directory, "1.2.3", "none");
    addUpdateMetadata(directory, {
      fileName: "latest.yml",
      version: "1.2.3",
      channel: "latest",
      releaseType: "release",
      primaryName: artifacts.setupName,
      assets: [{ name: artifacts.setupName, filePath: artifacts.setupPath }],
    });
    fs.appendFileSync(artifacts.setupPath, "tampered");
    assertContractError(() => validate(directory), "UPDATE_SHA512_MISMATCH");
  });
});

test("CLI confirms tag-derived mode/version and emits one JSON manifest", (t) => {
  const directory = fixtureDirectory(t);
  addMacArtifacts(directory, "3.0.0", "none");
  const argv = [
    "--tag", "v3.0.0",
    "--version", "3.0.0",
    "--mode", "stable",
    "--platform", "mac",
    "--assets-dir", directory,
    "--expected-repo", EXPECTED_REPO,
    "--signing-status", "none",
  ];
  assert.equal(parseCliArgs(argv).platform, "mac");

  let output = "";
  const manifest = main({ argv, write: (value) => { output += value; } });
  assert.deepEqual(JSON.parse(output), manifest);
  assert.equal(output.trim().split("\n").length, 1);
  assert.equal(output.includes(directory), false);

  assertContractError(
    () => validate(directory, { tag: "v3.0.0", version: "3.0.1", platform: "mac" }),
    "VERSION_TAG_MISMATCH",
  );
});
