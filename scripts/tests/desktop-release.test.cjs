const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { readVersion, assertReleaseTag, runReleaseChecks, checkRevision, verifyUpload, assertPgLiveProof } = require("../desktop-release/guard.cjs");
const { resolvePublishMode, normalizeBuildEnvironment } = require("../../desktop/scripts/run-electron-builder.cjs");

function fixture(t, version = "1.2.3") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anw-release-guard-test-"));
  fs.mkdirSync(path.join(directory, "desktop"));
  fs.writeFileSync(path.join(directory, "desktop/package.json"), JSON.stringify({ version }));
  fs.mkdirSync(path.join(directory, ".tmp"));
  fs.writeFileSync(path.join(directory, ".tmp/pg-live-gate.json"), JSON.stringify({ schema: 1, status: "passed", head: "tested-head", runId: "run", runAttempt: "1" }));
  t.after(() => { assert.equal(path.dirname(directory), os.tmpdir()); fs.rmSync(directory, { recursive: true, force: true }); });
  return directory;
}
function gitFixture(overrides = {}) {
  return args => {
    const key = args.join(" ");
    if (key in overrides) return typeof overrides[key] === "function" ? overrides[key]() : overrides[key];
    if (key === "status --porcelain") return "";
    if (key.startsWith("rev-parse ")) return "tested-head";
    if (key.startsWith("merge-base ")) return "";
    throw new Error(`Unexpected git call: ${key}`);
  };
}
const ci = { GITHUB_ACTIONS: "true", GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v1.2.3", GITHUB_REF: "refs/tags/v1.2.3", GITHUB_RUN_ID: "run", GITHUB_RUN_ATTEMPT: "1" };

test("release version is stable and the only allowed tag is the exact package version", t => {
  assert.equal(readVersion(fixture(t)), "1.2.3");
  assertReleaseTag("v1.2.3", "1.2.3");
  for (const version of ["desktop-1.2.3", "1.2.3-r1", "01.2.3", "", null]) assert.throws(() => readVersion(fixture(t, version)), /stable/);
  for (const tag of ["v1.2.4", "desktop-v1.2.3", "main", "beta", "v1.2.3-r1", undefined]) assert.throws(() => assertReleaseTag(tag, "1.2.3"), /must be v1.2.3/);
});

test("a failed check stops the release sequence and all test writes use isolated storage", t => {
  const calls = [];
  assert.throws(() => runReleaseChecks(fixture(t), { env: { DATABASE_URL: "file:/production.db", AI_NOVEL_APP_DATA_DIR: "/production", AI_NOVEL_ACCESS_TOKEN: "production-secret" },
    run: (args, options) => { calls.push({ args, options }); if (args[0] === "test:all") throw new Error("failing test"); },
  }), /Release checks failed.*test:all/);
  assert.equal(calls.length, 3);
  for (const { options } of calls) {
    assert.equal(options.env.NODE_ENV, "test");
    assert.equal(options.env.AI_NOVEL_DATABASE_MODE, "sqlite");
    assert.equal(options.env.AI_NOVEL_ACCESS_TOKEN, "");
    assert.notEqual(options.env.DATABASE_URL, "file:/production.db");
    assert.match(options.env.DATABASE_URL, /anw-release-check-/);
    assert.match(options.env.AI_NOVEL_APP_DATA_DIR, /anw-release-check-/);
  }
});

test("successful checks include typecheck, all server/client tests and desktop/script contracts", t => {
  const calls = [];
  runReleaseChecks(fixture(t), { env: {}, run: args => calls.push(args.join(" ")) });
  assert.deepEqual(calls, ["typecheck", "--filter @ai-novel/server prisma:deploy", "test:all", "--filter @ai-novel/desktop build", "test:release-guards", "test:pg-live"]);
});

test("a dirty tree never runs checks and an edited or replaced tested revision is rejected", t => {
  const root = fixture(t);
  let checked = false;
  assert.throws(() => checkRevision(root, { git: gitFixture({ "status --porcelain": " M file" }), runChecks: () => { checked = true; } }), /clean/);
  assert.equal(checked, false);
  let head = "old";
  assert.throws(() => checkRevision(root, { git: gitFixture({ "rev-parse HEAD": () => head }), runChecks: () => { head = "new"; } }), /tested revision changed/);
  assert.throws(() => checkRevision(root, { git: gitFixture(), runChecks: () => { fs.writeFileSync(path.join(root, "desktop/package.json"), '{"version":"1.2.4"}'); } }), /tested revision changed/);
});

test("mismatched tags and branch workflow dispatch cannot reach upload checks", t => {
  const root = fixture(t);
  for (const env of [{ ...ci, GITHUB_REF_NAME: "v1.2.4" }, { ...ci, GITHUB_REF_NAME: "desktop-v1.2.3" }, { ...ci, GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "main", GITHUB_REF: "refs/heads/main" }]) {
    let checks = 0;
    assert.throws(() => verifyUpload(root, { env, git: gitFixture(), runChecks: () => { checks++; } }));
    assert.equal(checks, 0);
  }
});

test("the release tag must point to HEAD and its commit must belong to main", t => {
  const root = fixture(t);
  assert.throws(() => verifyUpload(root, { env: ci, git: gitFixture({ "rev-parse refs/tags/v1.2.3^{commit}": "other-head" }), runChecks: () => {} }), /current release commit/);
  assert.throws(() => verifyUpload(root, { env: ci, git: gitFixture({ "merge-base --is-ancestor HEAD refs/remotes/origin/main": () => { throw new Error("not main"); } }), runChecks: () => {} }), /contained in main/);
});

test("an upload cannot proceed when tests fail; only the same clean passing revision can reuse checks", t => {
  const root = fixture(t);
  let head = "tested-head";
  const git = gitFixture({
    "rev-parse HEAD": () => head,
    "rev-parse refs/tags/v1.2.3^{commit}": () => head,
  });
  assert.throws(() => verifyUpload(root, { env: ci, git, runChecks: () => { throw new Error("tests failed"); } }), /tests failed/);
  let checks = 0;
  const runChecks = () => { checks++; };
  assert.equal(verifyUpload(root, { env: ci, git, runChecks }), "v1.2.3");
  assert.equal(verifyUpload(root, { env: ci, git, runChecks }), "v1.2.3");
  assert.equal(checks, 1);
  assert.equal(verifyUpload(root, { env: ci, git, runChecks, forceTests: true }), "v1.2.3");
  assert.equal(checks, 2);
  const failChecks = () => { throw new Error("rerun failed"); };
  assert.throws(() => verifyUpload(root, { env: ci, git, runChecks: failChecks, forceTests: true }), /rerun failed/);
  assert.throws(() => verifyUpload(root, { env: ci, git, runChecks: failChecks }), /rerun failed/);
  head = "new-head";
  fs.writeFileSync(path.join(root, ".tmp/pg-live-gate.json"), JSON.stringify({ schema: 1, status: "passed", head, runId: "run", runAttempt: "1" }));
  assert.equal(verifyUpload(root, { env: ci, git, runChecks }), "v1.2.3");
  assert.equal(checks, 3);
  assert.throws(() => checkRevision(root, { git: gitFixture({ "status --porcelain": " M file" }), runChecks }), /clean/);
  assert.equal(checks, 3);
});

test("local uploads require the matching tag to be pushed before contacting the publisher", t => {
  const root = fixture(t);
  const remoteCall = "ls-remote --tags origin refs/tags/v1.2.3 refs/tags/v1.2.3^{}";
  assert.throws(() => verifyUpload(root, { env: {}, git: gitFixture({ [remoteCall]: "" }), runChecks: () => {} }), /before uploading/);
  assert.equal(verifyUpload(root, { env: {}, git: gitFixture({ [remoteCall]: "annotation\trefs/tags/v1.2.3\ntested-head\trefs/tags/v1.2.3^{}" }), runChecks: () => {} }), "v1.2.3");
});

test("all supported publish flag spellings share the guard and ambiguous flags are rejected", () => {
  for (const args of [["--publish", "always"], ["--publish=always"], ["-p", "always"]]) {
    assert.equal(resolvePublishMode(args), "always");
    assert.throws(() => normalizeBuildEnvironment({}, args), /no GH_TOKEN/);
  }
  assert.equal(resolvePublishMode(["--dir", "--win"]), undefined);
  assert.equal(resolvePublishMode(["--publish=never"]), "never");
  assert.throws(() => resolvePublishMode(["--publish", "never", "-p", "always"]), /exactly one/);
});

test("workflow publishes only on pushed version tags and manual dispatch is verification only", () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const req = createRequire(require.resolve("electron-builder/package.json", { paths: [path.join(repoRoot, "desktop")] }));
  const workflow = req("js-yaml").load(fs.readFileSync(path.join(repoRoot, ".github/workflows/desktop-release.yml"), "utf8"));
  assert.deepEqual(workflow.on.push.tags, ["v*"]);
  for (const name of ["publish-release", "publish-mac", "publish-linux"]) {
    assert.equal(workflow.jobs[name].needs, "pg-live-gate");
    assert.ok(workflow.jobs[name].steps.some(step => step.uses?.startsWith("actions/download-artifact") && step.with.name.includes("github.run_attempt")));
    assert.match(workflow.jobs[name].if, /event_name == 'push'/);
    assert.match(workflow.jobs[name].if, /ref_type == 'tag'/);
    assert.equal(workflow.jobs[name].steps.find(step => step.uses?.startsWith("actions/checkout")).with["fetch-depth"], 0);
    assert.ok(!workflow.jobs[name].steps.some(step => step.run?.includes("generate-desktop-icons")));
  }
  assert.match(workflow.jobs["verify-only"].if, /workflow_dispatch/);
  assert.ok(!workflow.jobs["verify-only"].steps.some(step => step.run?.includes("--publish always")));
});

test("PG gate proof rejects missing, stale, failed and other-run evidence", t => {
  const root = fixture(t);
  assertPgLiveProof(root, ci, "tested-head");
  for (const [env, head] of [[ci, "other"], [{ ...ci, GITHUB_RUN_ID: "other" }, "tested-head"], [{ ...ci, GITHUB_RUN_ATTEMPT: "2" }, "tested-head"]]) {
    assert.throws(() => assertPgLiveProof(root, env, head), /PG live gate/);
  }
  fs.writeFileSync(path.join(root, ".tmp/pg-live-gate.json"), '{"status":"failed"}');
  assert.throws(() => assertPgLiveProof(root, ci, "tested-head"), /PG live gate/);
  fs.unlinkSync(path.join(root, ".tmp/pg-live-gate.json"));
  assert.throws(() => verifyUpload(root, { env: ci, git: gitFixture(), runChecks: () => {} }), /PG live gate/);
});

test("PG suite fails without explicit configuration and stays outside portable suites", () => {
  const { spawnSync } = require("node:child_process");
  const env = { ...process.env };
  delete env.PG_ADMIN_URL;
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../acceptance/pg-cloud-harness.cjs")], { env, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PG_ADMIN_URL is required/);
  const { selectTestFiles } = require("../../server/scripts/run-tests.cjs");
  for (const mode of ["fast", "integration", "all"]) assert.ok(!selectTestFiles(mode).some(file => file.endsWith("pgCloudAcceptance.harness.test.js")));
  assert.deepEqual(selectTestFiles("pg-live").map(file => path.basename(file)), ["pgCloudAcceptance.harness.test.js"]);
});

test("every desktop workflow requires provisioned PG and downloads its run-scoped proof", () => {
  const root = path.resolve(__dirname, "../..");
  const req = createRequire(require.resolve("electron-builder/package.json", { paths: [path.join(root, "desktop")] }));
  const load = name => req("js-yaml").load(fs.readFileSync(path.join(root, `.github/workflows/${name}.yml`), "utf8"));
  const gate = load("pg-live-gate").jobs["pg-live"];
  assert.equal(gate["runs-on"], "ubuntu-latest");
  assert.equal(gate.services.postgres.image, "postgres:17");
  assert.ok(!gate.if);
  assert.ok(!gate["continue-on-error"]);
  assert.ok(gate.steps.some(step => step.run === "pnpm test:pg-live" && step.env.PG_ADMIN_URL));
  const upload = gate.steps.find(step => step.uses?.startsWith("actions/upload-artifact"));
  assert.equal(upload.with.path, ".tmp/pg-live-gate.json");
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.match(upload.with.name, /github.run_id/);
  assert.match(upload.with.name, /github.run_attempt/);
  for (const workflow of [load("desktop-release"), load("desktop-beta-release")]) {
    assert.equal(workflow.jobs["pg-live-gate"].uses, "./.github/workflows/pg-live-gate.yml");
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (name === "pg-live-gate") continue;
      assert.equal(job.needs, "pg-live-gate");
      assert.ok(!job["continue-on-error"]);
      const download = job.steps.find(step => step.uses?.startsWith("actions/download-artifact"));
      assert.equal(download.with.name, upload.with.name);
      assert.equal(download.with.path, ".tmp");
      assert.ok(!download.with["run-id"], "artifact must come from the current run");
    }
  }
});
