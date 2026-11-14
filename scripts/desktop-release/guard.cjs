const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function readVersion(repoRoot) {
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop/package.json"), "utf8")).version;
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("desktop/package.json version must be stable X.Y.Z.");
  }
  return version;
}

function assertReleaseTag(tag, version) {
  if (tag !== `v${version}`) throw new Error(`Release tag must be v${version}; got ${tag || "(missing)"}.`);
}

function gitAt(repoRoot, args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runPnpm(args, options) {
  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, { ...options, shell: process.platform === "win32", stdio: "inherit" });
}

function assertPgLiveProof(repoRoot, env, head) {
  let proof;
  try { proof = JSON.parse(fs.readFileSync(path.join(repoRoot, ".tmp/pg-live-gate.json"), "utf8")); }
  catch { throw new Error("Required PG live gate proof is missing; no publication is allowed."); }
  if (proof.schema !== 1 || proof.status !== "passed" || proof.head !== head
    || !env.GITHUB_RUN_ID || proof.runId !== env.GITHUB_RUN_ID
    || !env.GITHUB_RUN_ATTEMPT || proof.runAttempt !== env.GITHUB_RUN_ATTEMPT) {
    throw new Error("Required PG live gate proof must match this revision and workflow run attempt.");
  }
}

/** All test writes belong to a fresh disposable workspace, never the user's database. */
function runReleaseChecks(repoRoot, { run = runPnpm, env = process.env } = {}) {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "anw-release-check-"));
  const options = { cwd: repoRoot, env: { ...env, NODE_ENV: "test", AI_NOVEL_RUNTIME: "web", AI_NOVEL_ACCESS_TOKEN: "",
    AI_NOVEL_DATABASE_MODE: "sqlite", AI_NOVEL_APP_DATA_DIR: path.join(testRoot, "app"),
    DATABASE_URL: `file:${path.join(testRoot, "tests.sqlite").replace(/\\/g, "/")}` } };
  console.log(`[desktop-release] isolated tests: ${testRoot}`);
  for (const args of [
    ["typecheck"],
    ["--filter", "@ai-novel/server", "prisma:deploy"],
    ["test:all"],
    ["--filter", "@ai-novel/desktop", "build"],
    ["test:release-guards"],
  ]) {
    try { run(args, options); }
    catch (cause) { throw new Error(`Release checks failed: pnpm ${args.join(" ")}. No publication is allowed.`, { cause }); }
  }
  if (env.GITHUB_ACTIONS === "true") {
    assertPgLiveProof(repoRoot, env, gitAt(repoRoot, ["rev-parse", "HEAD"]));
  } else {
    // The PG URL belongs only to this suite, never to the portable SQLite tests.
    try { run(["test:pg-live"], { cwd: repoRoot, env: { ...env } }); }
    catch (cause) { throw new Error("Release checks failed: pnpm test:pg-live. No publication is allowed.", { cause }); }
  }
}

const releaseCheckMarkerSchema = 2;

function releaseCheckMarkerPath(repoRoot, head) {
  return path.join(repoRoot, ".tmp", "desktop-release", `${encodeURIComponent(head)}.json`);
}

function hasPassingReleaseCheck(repoRoot, head, version) {
  try {
    const marker = JSON.parse(fs.readFileSync(releaseCheckMarkerPath(repoRoot, head), "utf8"));
    return marker.schema === releaseCheckMarkerSchema
      && marker.status === "passed"
      && marker.head === head
      && marker.desktopVersion === version;
  } catch (_error) {
    return false;
  }
}

function recordPassingReleaseCheck(repoRoot, head, version) {
  const markerPath = releaseCheckMarkerPath(repoRoot, head);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${JSON.stringify({
    schema: releaseCheckMarkerSchema,
    status: "passed",
    head,
    desktopVersion: version,
    passedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
}

/** Do not tag or upload a revision other than the one that actually passed checks. */
function checkRevision(repoRoot, {
  git = args => gitAt(repoRoot, args),
  runChecks = () => runReleaseChecks(repoRoot),
  forceTests = false,
} = {}) {
  if (git(["status", "--porcelain"])) throw new Error("Working tree must be clean before release checks.");
  const head = git(["rev-parse", "HEAD"]);
  const version = readVersion(repoRoot);
  const reusePassingCheck = !forceTests && hasPassingReleaseCheck(repoRoot, head, version);
  if (reusePassingCheck) {
    console.log(`[desktop-release] reusing passed checks for ${head}; working tree is clean.`);
  } else {
    // A failed rerun must not leave an older pass eligible for the next upload.
    fs.rmSync(releaseCheckMarkerPath(repoRoot, head), { force: true });
    runChecks();
  }
  if (git(["rev-parse", "HEAD"]) !== head || readVersion(repoRoot) !== version || git(["status", "--porcelain"])) {
    throw new Error("The tested revision changed. Run release checks again before tagging or uploading.");
  }
  if (!reusePassingCheck) recordPassingReleaseCheck(repoRoot, head, version);
  return { head, version };
}

function verifyUpload(repoRoot, {
  env = process.env,
  git = args => gitAt(repoRoot, args),
  runChecks = () => runReleaseChecks(repoRoot),
  forceTests = false,
} = {}) {
  const version = readVersion(repoRoot);
  const tag = `v${version}`;
  if (env.GITHUB_REF_NAME) assertReleaseTag(env.GITHUB_REF_NAME, version);
  if (env.GITHUB_REF && env.GITHUB_REF !== `refs/tags/${tag}`) throw new Error("GitHub release ref does not match the package version.");
  if (env.GITHUB_ACTIONS === "true") {
    if (env.GITHUB_REF_TYPE !== "tag") throw new Error("Public desktop uploads require a version tag, not workflow dispatch on a branch.");
    assertReleaseTag(env.GITHUB_REF_NAME, version);
    if (env.GITHUB_REF !== `refs/tags/${tag}`) throw new Error("GitHub release ref does not match the package version.");
  }
  const head = git(["rev-parse", "HEAD"]);
  if (env.GITHUB_ACTIONS === "true") assertPgLiveProof(repoRoot, env, head);
  if (git(["rev-parse", `refs/tags/${tag}^{commit}`]) !== head) throw new Error(`${tag} must point to the current release commit.`);
  if (env.GITHUB_ACTIONS !== "true") {
    const refs = git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split(/\r?\n/).filter(Boolean).map(line => line.split(/\s+/));
    const remoteHead = refs.find(([, ref]) => ref.endsWith("^{}"))?.[0] ?? refs[0]?.[0];
    if (remoteHead !== head) throw new Error(`Push ${tag} pointing to the tested release commit before uploading.`);
  }
  try { git(["merge-base", "--is-ancestor", "HEAD", env.GITHUB_ACTIONS === "true" ? "refs/remotes/origin/main" : "refs/heads/main"]); }
  catch (cause) { throw new Error("Public desktop uploads require a release commit contained in main.", { cause }); }
  checkRevision(repoRoot, { git, runChecks, forceTests });
  return tag;
}

module.exports = { readVersion, assertReleaseTag, runReleaseChecks, checkRevision, verifyUpload, assertPgLiveProof };
