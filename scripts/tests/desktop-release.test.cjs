const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const {
  readVersion, assertReleaseTag, runReleaseChecks, checkRevision, verifyUpload, assertPgLiveProof,
  releaseChecks, writeBuildManifest, assertBuildManifest, assertAllBuildManifests, assertSafeArtifactName,
} = require("../desktop-release/guard.cjs");
const { resolvePublishMode, normalizeBuildEnvironment } = require("../../desktop/scripts/run-electron-builder.cjs");
const { mergeMacLatestYml, collectUploadPlan } = require("../desktop-release/publish-artifacts.cjs");

function fixture(t, version = "1.2.3") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "anw-release-guard-test-"));
  fs.mkdirSync(path.join(directory, "desktop"));
  fs.writeFileSync(path.join(directory, "desktop/package.json"), JSON.stringify({ version }));
  fs.mkdirSync(path.join(directory, ".tmp"));
  fs.writeFileSync(path.join(directory, ".tmp/pg-live-gate.json"), JSON.stringify({ schema: 1, status: "passed", head: "tested-head", runId: "run", runAttempt: "1" }));
  fs.mkdirSync(path.join(directory, ".tmp/release-checks"));
  fs.writeFileSync(path.join(directory, ".tmp/release-checks/release-checks-run-1.json"), JSON.stringify({
    schema: 1, status: "passed", head: "tested-head", runId: "run", runAttempt: "1", desktopVersion: version,
    checks: releaseChecks,
  }));
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

test("successful checks include typecheck, all server/client tests, quality and desktop/script contracts", t => {
  const calls = [];
  runReleaseChecks(fixture(t), { env: {}, run: args => calls.push(args.join(" ")) });
  assert.deepEqual(calls, [
    "typecheck",
    "--filter @ai-novel/server prisma:deploy",
    "test:all",
    "--filter @ai-novel/server test:quality",
    "--filter @ai-novel/desktop build",
    "test:release-guards",
    "test:pg-live",
  ]);
});

test("CI portable release checks do not require PG proof while checkRevision still does", t => {
  const root = fixture(t);
  const calls = [];
  runReleaseChecks(root, { env: { GITHUB_ACTIONS: "true" }, run: args => calls.push(args.join(" ")) });
  assert.deepEqual(calls, [
    "typecheck",
    "--filter @ai-novel/server prisma:deploy",
    "test:all",
    "--filter @ai-novel/server test:quality",
    "--filter @ai-novel/desktop build",
    "test:release-guards",
  ]);
  assert.equal(calls.includes("test:pg-live"), false);
  fs.unlinkSync(path.join(root, ".tmp/pg-live-gate.json"));
  assert.throws(() => checkRevision(root, {
    env: { GITHUB_ACTIONS: "true", GITHUB_RUN_ID: "run", GITHUB_RUN_ATTEMPT: "1" },
    git: gitFixture(),
    runChecks: () => {},
  }), /PG live gate/);
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

test("an upload uses only the same clean passing CI artifact", t => {
  const root = fixture(t);
  let head = "tested-head";
  const git = gitFixture({
    "rev-parse HEAD": () => head,
    "rev-parse refs/tags/v1.2.3^{commit}": () => head,
  });
  assert.equal(verifyUpload(root, { env: ci, git, runChecks: () => { throw new Error("must not run portable checks"); } }), "v1.2.3");
  let checks = 0;
  const runChecks = () => { checks++; };
  assert.equal(verifyUpload(root, { env: ci, git, runChecks }), "v1.2.3");
  assert.equal(verifyUpload(root, { env: ci, git, runChecks }), "v1.2.3");
  assert.equal(checks, 0);
  assert.equal(verifyUpload(root, { env: ci, git, runChecks, forceTests: true }), "v1.2.3");
  assert.equal(checks, 0);
  const failChecks = () => { throw new Error("rerun failed"); };
  assert.equal(verifyUpload(root, { env: ci, git, runChecks: failChecks, forceTests: true }), "v1.2.3");
  assert.equal(verifyUpload(root, { env: ci, git, runChecks: failChecks }), "v1.2.3");
  head = "new-head";
  fs.writeFileSync(path.join(root, ".tmp/pg-live-gate.json"), JSON.stringify({ schema: 1, status: "passed", head, runId: "run", runAttempt: "1" }));
  fs.writeFileSync(path.join(root, ".tmp/release-checks/release-checks-run-1.json"), JSON.stringify({
    schema: 1, status: "passed", head, runId: "run", runAttempt: "1", desktopVersion: "1.2.3",
    checks: releaseChecks,
  }));
  assert.equal(verifyUpload(root, { env: ci, git, runChecks }), "v1.2.3");
  assert.equal(checks, 0);
  assert.throws(() => checkRevision(root, { git: gitFixture({ "status --porcelain": " M file" }), runChecks }), /clean/);
  assert.equal(checks, 0);
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
  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.jobs["release-checks"].needs, undefined);
  assert.ok(!workflow.jobs["release-checks"].steps.some(step => step.uses?.startsWith("actions/download-artifact")));
  for (const name of ["build-windows", "build-mac", "build-linux"]) {
    assert.match(workflow.jobs[name].if, /event_name == 'push'/);
    assert.match(workflow.jobs[name].if, /ref_type == 'tag'/);
    assert.equal(workflow.jobs[name].permissions?.contents, "read");
    assert.ok(workflow.jobs[name].steps.some(step => step.run?.includes("--publish never")));
    assert.ok(!workflow.jobs[name].steps.some(step => /\bGH_TOKEN\b/.test(JSON.stringify(step)) && step.run?.includes("publish always")));
    assert.ok(!Object.keys(workflow.jobs[name].env || {}).includes("GH_TOKEN"));
  }
  const publish = workflow.jobs["publish-release"];
  assert.deepEqual(publish.needs, ["pg-live-gate", "release-checks", "build-windows", "build-mac", "build-linux"]);
  assert.equal(publish.permissions.contents, "write");
  assert.ok(publish.steps.some(step => step.run === "node scripts/desktop-release/publish-artifacts.cjs"));
  assert.ok(!publish.steps.some(step => step.run?.includes("stage:desktop")));
  assert.ok(!publish.steps.some(step => step.run?.includes("run-electron-builder")));
  assert.ok(!publish.steps.some(step => step.run?.includes("publish:desktop:release")));
  assert.match(workflow.jobs["verify-only"].if, /workflow_dispatch/);
  assert.ok(!workflow.jobs["verify-only"].steps.some(step => step.run?.includes("--publish always")));
  assert.equal(workflow.jobs["verify-only"].needs, "pg-live-gate");
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

test("trusted release checks reject missing, stale, failed, incomplete, and mismatched artifacts", t => {
  const root = fixture(t);
  const artifact = path.join(root, ".tmp/release-checks/release-checks-run-1.json");
  const valid = JSON.parse(fs.readFileSync(artifact, "utf8"));
  for (const mutation of [
    value => ({ ...value, head: "other" }),
    value => ({ ...value, runId: "other" }),
    value => ({ ...value, runAttempt: "2" }),
    value => ({ ...value, desktopVersion: "1.2.4" }),
    value => ({ ...value, status: "failed" }),
    value => ({ ...value, checks: value.checks.slice(0, -1) }),
  ]) {
    fs.writeFileSync(artifact, JSON.stringify(mutation(valid)));
    assert.throws(() => verifyUpload(root, { env: ci, git: gitFixture(), runChecks: () => {} }), /Trusted release checks artifact/);
  }
  fs.unlinkSync(artifact);
  assert.throws(() => verifyUpload(root, { env: ci, git: gitFixture(), runChecks: () => {} }), /artifact is missing/);
});

test("PG suite fails without explicit configuration without touching the release proof", t => {
  const { spawnSync } = require("node:child_process");
  const env = { ...process.env };
  delete env.PG_ADMIN_URL;
  const repoRoot = path.resolve(__dirname, "../..");
  const defaultProof = path.join(repoRoot, ".tmp/pg-live-gate.json");
  const before = fs.existsSync(defaultProof)
    ? { bytes: fs.readFileSync(defaultProof), mtimeMs: fs.statSync(defaultProof).mtimeMs }
    : null;
  const isolatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "anw-pg-proof-negative-"));
  t.after(() => { assert.equal(path.dirname(isolatedDirectory), os.tmpdir()); fs.rmSync(isolatedDirectory, { recursive: true, force: true }); });
  env.PG_LIVE_PROOF_PATH = path.join(isolatedDirectory, "pg-live-gate.json");
  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../acceptance/pg-cloud-harness.cjs")], { env, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PG_ADMIN_URL is required/);
  assert.equal(fs.existsSync(defaultProof), before !== null);
  if (before) {
    assert.deepEqual(fs.readFileSync(defaultProof), before.bytes);
    assert.equal(fs.statSync(defaultProof).mtimeMs, before.mtimeMs);
  }
  const { selectTestFiles } = require("../../server/scripts/run-tests.cjs");
  for (const mode of ["fast", "integration", "all"]) assert.ok(!selectTestFiles(mode).some(file => file.endsWith("pgCloudAcceptance.harness.test.js")));
  assert.deepEqual(selectTestFiles("pg-live").map(file => path.basename(file)), ["pgCloudAcceptance.harness.test.js"]);
});

test("every desktop workflow requires provisioned PG and fail-closed upload proofs", () => {
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

  const release = load("desktop-release");
  assert.equal(release.jobs["pg-live-gate"].uses, "./.github/workflows/pg-live-gate.yml");
  assert.equal(release.jobs["release-checks"].needs, undefined);
  const releaseUpload = release.jobs["release-checks"].steps.find(step => step.uses?.startsWith("actions/upload-artifact"));
  assert.match(releaseUpload.with.name, /github.run_id/);
  assert.match(releaseUpload.with.name, /github.run_attempt/);
  assert.match(releaseUpload.with.path, /release-checks-/);
  const publish = release.jobs["publish-release"];
  assert.ok(publish.needs.includes("pg-live-gate"));
  assert.ok(publish.needs.includes("release-checks"));
  assert.ok(publish.steps.some(step => step.uses?.startsWith("actions/download-artifact") && step.with.name === upload.with.name));
  assert.ok(publish.steps.some(step => step.uses?.startsWith("actions/download-artifact") && step.with.name === releaseUpload.with.name));
  assert.ok(publish.steps.some(step => step.run === "node scripts/desktop-release/publish-artifacts.cjs"));
  assert.ok(!publish.steps.some(step => step.run === "pnpm typecheck"));
  assert.equal(release.jobs["verify-only"].needs, "pg-live-gate");
  assert.ok(release.jobs["verify-only"].steps.some(step => step.uses?.startsWith("actions/download-artifact") && step.with.name === upload.with.name));

  const beta = load("desktop-beta-release");
  assert.equal(beta.jobs["pg-live-gate"].uses, "./.github/workflows/pg-live-gate.yml");
  assert.equal(beta.jobs["release-checks"].needs, undefined);
  assert.deepEqual(beta.jobs["publish-beta"].needs, ["pg-live-gate", "release-checks"]);
  assert.ok(beta.jobs["publish-beta"].steps.some(step => step.run === "node scripts/desktop-release/verify-proof.cjs"));
});

function writeFakeBuildTree(root, version = "1.2.3") {
  const buildsRoot = path.join(root, ".tmp", "desktop-builds");
  const filesByPlatform = {
    "win-x64": [
      `Biz-Novel-Studio-${version}-setup-x64.exe`,
      `Biz-Novel-Studio-${version}-setup-x64.exe.blockmap`,
      `Biz-Novel-Studio-${version}-portable-x64.exe`,
      "latest.yml",
    ],
    "mac-x64": [
      `Biz-Novel-Studio-${version}-mac-x64.dmg`,
      `Biz-Novel-Studio-${version}-mac-x64.dmg.blockmap`,
      "latest-mac.yml",
    ],
    "mac-arm64": [
      `Biz-Novel-Studio-${version}-mac-arm64.dmg`,
      `Biz-Novel-Studio-${version}-mac-arm64.dmg.blockmap`,
      "latest-mac.yml",
    ],
    "linux-x64": [
      `Biz-Novel-Studio-${version}-linux-x86_64.AppImage`,
      "latest-linux.yml",
    ],
  };
  for (const [platformKey, names] of Object.entries(filesByPlatform)) {
    const distDir = path.join(buildsRoot, platformKey);
    fs.mkdirSync(distDir, { recursive: true });
    for (const name of names) {
      const body = name.endsWith(".yml")
        ? `version: ${version}\nfiles:\n  - url: ${names[0]}\n    sha512: dummy\n    size: 1\npath: ${names[0]}\nsha512: dummy\n`
        : `${platformKey}:${name}:payload`;
      fs.writeFileSync(path.join(distDir, name), body);
    }
    if (platformKey.startsWith("mac-")) {
      const dmg = names.find((name) => name.endsWith(".dmg"));
      fs.writeFileSync(path.join(distDir, "latest-mac.yml"), [
        `version: ${version}`,
        "files:",
        `  - url: ${dmg}`,
        "    sha512: dummy-sha",
        "    size: 12",
        `path: ${dmg}`,
        "sha512: dummy-sha",
        "releaseDate: '2026-01-01T00:00:00.000Z'",
        "",
      ].join("\n"));
    }
    writeBuildManifest(root, {
      env: { GITHUB_RUN_ID: "run", GITHUB_RUN_ATTEMPT: "1" },
      git: () => "tested-head",
      platformKey,
      distDir,
    });
  }
  return buildsRoot;
}

test("build manifests bind run identity and reject digest or path tampering", t => {
  const root = fixture(t);
  const buildsRoot = writeFakeBuildTree(root);
  const manifests = assertAllBuildManifests(root, ci, "tested-head", "1.2.3", buildsRoot);
  assert.equal(Object.keys(manifests).length, 4);

  const winDir = path.join(buildsRoot, "win-x64");
  const setup = path.join(winDir, "Biz-Novel-Studio-1.2.3-setup-x64.exe");
  fs.writeFileSync(setup, "tampered");
  assert.throws(() => assertBuildManifest(root, ci, "tested-head", "1.2.3", "win-x64", winDir), /digest mismatch/);
  fs.writeFileSync(setup, "win-x64:Biz-Novel-Studio-1.2.3-setup-x64.exe:payload");

  assert.throws(() => assertSafeArtifactName("../escape.exe"), /unsafe/);
  assert.throws(() => assertSafeArtifactName("sub/dir.exe"), /unsafe/);
  fs.symlinkSync(setup, path.join(winDir, "link-setup.exe"));
  const manifest = JSON.parse(fs.readFileSync(path.join(winDir, "build-manifest.json"), "utf8"));
  manifest.files.push({
    name: "link-setup.exe",
    size: 1,
    sha256: "x",
    sha512: "y",
  });
  fs.writeFileSync(path.join(winDir, "build-manifest.json"), JSON.stringify(manifest));
  assert.throws(() => assertBuildManifest(root, ci, "tested-head", "1.2.3", "win-x64", winDir), /regular file|unexpected file/);
});

test("publish artifact planner merges mac metadata and never rebuilds packages", t => {
  const root = fixture(t);
  const buildsRoot = writeFakeBuildTree(root);
  const manifests = assertAllBuildManifests(root, ci, "tested-head", "1.2.3", buildsRoot);
  const plan = collectUploadPlan(buildsRoot, manifests);
  assert.ok(plan.some((item) => item.name === "latest-mac.yml" && item.platformKey === "mac-merged"));
  assert.equal(plan.filter((item) => item.name === "latest-mac.yml").length, 1);
  const merged = fs.readFileSync(path.join(buildsRoot, "latest-mac.yml"), "utf8");
  assert.match(merged, /mac-x64\.dmg/);
  assert.match(merged, /mac-arm64\.dmg/);
  assert.equal(plan.some((item) => item.source.includes("electron-builder")), false);

  const onlyArm = mergeMacLatestYml(
    path.join(buildsRoot, "mac-x64"),
    path.join(buildsRoot, "mac-arm64"),
  );
  assert.match(onlyArm, /mac-x64\.dmg/);
  assert.match(onlyArm, /mac-arm64\.dmg/);
});
