const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  parseArgs: parseCollectorArgs,
} = require("../../.github/scripts/collect-desktop-release-assets.cjs");
const {
  parseArgs: parseReleaseRefArgs,
} = require("../../.github/scripts/validate-desktop-release-ref.cjs");
const {
  parseArgs: parseDraftArgs,
} = require("../../.github/scripts/validate-github-release-draft.cjs");

test("release workflow helpers reject duplicate singleton options", () => {
  assert.throws(
    () => parseCollectorArgs([
      "--source", "win",
      "--source", "mac",
      "--output", "all",
      "--output", "other",
    ]),
    /--output may only be provided once/,
  );
  assert.throws(
    () => parseReleaseRefArgs([
      "--tag", "v1.2.3",
      "--tag", "v1.2.4",
      "--repository", "yangtzehina/AI-Novel-Writing-Assistant",
    ]),
    /--tag may only be provided once/,
  );
  assert.throws(
    () => parseDraftArgs([
      "--release-json", "release.json",
      "--assets-dir", "assets",
      "--tag", "v1.2.3",
      "--tag", "v1.2.4",
      "--prerelease", "false",
    ]),
    /--tag may only be provided once/,
  );
});

test("asset collection keeps repeated sources explicit and resolves one output", () => {
  const parsed = parseCollectorArgs([
    "--source", "win",
    "--source", "mac",
    "--output", "all",
  ]);
  assert.deepEqual(parsed.sources, [path.resolve("win"), path.resolve("mac")]);
  assert.equal(parsed.output, path.resolve("all"));
});

test("draft validation accepts only exact boolean text", () => {
  const base = [
    "--release-json", "release.json",
    "--assets-dir", "assets",
    "--tag", "v1.2.3",
  ];
  assert.equal(parseDraftArgs([...base, "--prerelease", "true"])["--prerelease"], "true");
  assert.equal(parseDraftArgs([...base, "--prerelease", "false"])["--prerelease"], "false");
  assert.throws(
    () => parseDraftArgs([...base, "--prerelease", "no"]),
    /must be exactly true or false/,
  );
});
