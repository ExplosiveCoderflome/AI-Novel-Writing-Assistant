const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertVersionUpgrade,
  parseArgs,
  resolveVersionPlan,
} = require("./bump-desktop-version.cjs");

test("resolves stable and public beta versions through the canonical contract", () => {
  assert.deepEqual(
    {
      branch: resolveVersionPlan("1.2.3").branch,
      channel: resolveVersionPlan("1.2.3").updateChannel,
      tag: resolveVersionPlan("1.2.3").tag,
    },
    { branch: "main", channel: "latest", tag: "v1.2.3" },
  );
  assert.deepEqual(
    {
      branch: resolveVersionPlan("1.2.3-beta.4").branch,
      channel: resolveVersionPlan("1.2.3-beta.4").updateChannel,
      tag: resolveVersionPlan("1.2.3-beta.4").tag,
    },
    { branch: "beta", channel: "beta", tag: "v1.2.3-beta.4" },
  );
});

test("allows monotonic beta progression and promotion to the matching stable version", () => {
  assert.equal(assertVersionUpgrade("0.4.9", "0.5.0-beta.1").target.version, "0.5.0-beta.1");
  assert.equal(assertVersionUpgrade("0.5.0-beta.1", "0.5.0-beta.2").target.version, "0.5.0-beta.2");
  assert.equal(assertVersionUpgrade("0.5.0-beta.2", "0.5.0").target.version, "0.5.0");
});

test("rejects downgrades, duplicate versions, and unsupported prerelease labels", () => {
  assert.throws(
    () => assertVersionUpgrade("0.5.0", "0.5.0-beta.3"),
    /must be greater than current version/,
  );
  assert.throws(() => assertVersionUpgrade("0.5.0-beta.2", "0.5.0-beta.2"), /must be greater/);
  assert.throws(() => resolveVersionPlan("0.5.0-rc.1"), /X\.Y\.Z or X\.Y\.Z-beta\.N/);
  assert.throws(() => resolveVersionPlan("desktop-v0.5.0"), /X\.Y\.Z or X\.Y\.Z-beta\.N/);
  assert.throws(() => resolveVersionPlan("01.5.0"), /X\.Y\.Z or X\.Y\.Z-beta\.N/);
});

test("parses dry-run beta bump arguments without changing any package", () => {
  assert.deepEqual(parseArgs(["--dry-run", "0.5.0-beta.1"]), {
    dryRun: true,
    help: false,
    version: "0.5.0-beta.1",
  });
});
