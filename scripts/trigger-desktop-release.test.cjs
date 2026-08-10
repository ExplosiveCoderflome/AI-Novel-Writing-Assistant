const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  assertHeadOnExpectedBranch,
  assertTagInExpectedBranchHistory,
  assertTagMatchesVersion,
  buildAtomicPushArgs,
  createGitRunner,
  main,
  parseArgs,
  resolveReleasePlan,
} = require("./trigger-desktop-release.cjs");

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commitFile(cwd, name, contents, message) {
  fs.writeFileSync(path.join(cwd, name), contents, "utf8");
  git(cwd, ["add", name]);
  git(cwd, ["commit", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

test("derives beta/main and rejects branch, channel, or tag overrides", () => {
  assert.equal(resolveReleasePlan("1.3.0-beta.2").branch, "beta");
  assert.equal(resolveReleasePlan("1.3.0").branch, "main");
  assert.throws(
    () => resolveReleasePlan("1.3.0-beta.2", { branch: "main" }),
    /must be released from beta/,
  );
  assert.throws(
    () => resolveReleasePlan("1.3.0", { channel: "release" }),
    /legacy release channel is not supported/,
  );
  assert.throws(
    () => assertTagMatchesVersion("desktop-v1.3.0", "1.3.0"),
    /must exactly match v1\.3\.0/,
  );
  assert.throws(
    () => assertTagMatchesVersion("v1.3.1", "1.3.0"),
    /must exactly match v1\.3\.0/,
  );
});

test("uses a single atomic push for the expected branch and exact tag", () => {
  assert.deepEqual(buildAtomicPushArgs("origin", "beta", "v1.3.0-beta.2"), [
    "push",
    "--atomic",
    "origin",
    "refs/heads/beta:refs/heads/beta",
    "refs/tags/v1.3.0-beta.2:refs/tags/v1.3.0-beta.2",
  ]);
});

test("defaults branch and channel options instead of hard-coding main or release", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), {
    remote: "origin",
    branch: "",
    channel: "",
    dryRun: true,
    help: false,
  });
});

test("requires beta tags in beta history and stable tags in main history", (t) => {
  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-git-"));
  t.after(() => fs.rmSync(tempRepo, { recursive: true, force: true }));

  git(tempRepo, ["init", "-b", "main"]);
  git(tempRepo, ["config", "user.name", "Desktop Release Test"]);
  git(tempRepo, ["config", "user.email", "desktop-release@example.invalid"]);
  commitFile(tempRepo, "main.txt", "main\n", "main release base");
  git(tempRepo, ["branch", "beta"]);
  git(tempRepo, ["checkout", "beta"]);
  const betaCommit = commitFile(tempRepo, "beta.txt", "beta\n", "beta release candidate");
  git(tempRepo, ["tag", "-a", "v1.1.0-beta.1", "-m", "beta tag", betaCommit]);
  git(tempRepo, ["tag", "-a", "v1.1.0", "-m", "invalid stable tag location", betaCommit]);

  const runGit = createGitRunner(tempRepo);
  assert.equal(assertHeadOnExpectedBranch(runGit, "beta"), betaCommit);
  assert.equal(assertTagInExpectedBranchHistory(runGit, "v1.1.0-beta.1", "1.1.0-beta.1"), betaCommit);
  assert.throws(
    () => assertTagInExpectedBranchHistory(runGit, "v1.1.0", "1.1.0"),
    /is not in main branch history/,
  );

  git(tempRepo, ["checkout", "main"]);
  assert.throws(() => assertHeadOnExpectedBranch(runGit, "beta"), /must be triggered from beta/);
});

test("dry-run selects main for stable and beta for beta without creating a tag", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-dry-run-"));
  const tempRepo = path.join(tempRoot, "repo");
  const tempRemote = path.join(tempRoot, "remote.git");
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  fs.mkdirSync(tempRepo);

  git(tempRepo, ["init", "-b", "main"]);
  git(tempRepo, ["config", "user.name", "Desktop Release Test"]);
  git(tempRepo, ["config", "user.email", "desktop-release@example.invalid"]);
  fs.mkdirSync(path.join(tempRepo, "desktop"));
  commitFile(tempRepo, "desktop/package.json", `${JSON.stringify({ version: "1.0.0" })}\n`, "stable version");
  git(tempRoot, ["init", "--bare", tempRemote]);
  git(tempRepo, ["remote", "add", "origin", tempRemote]);

  const stableLogs = [];
  main({
    argv: ["--dry-run"],
    cwd: tempRepo,
    packagePath: path.join(tempRepo, "desktop", "package.json"),
    log: (message) => stableLogs.push(message),
  });
  assert.ok(stableLogs.includes("[desktop-release] branch=main"));
  assert.equal(git(tempRepo, ["tag"]), "");

  git(tempRepo, ["checkout", "-b", "beta"]);
  commitFile(
    tempRepo,
    "desktop/package.json",
    `${JSON.stringify({ version: "1.1.0-beta.1" })}\n`,
    "public beta version",
  );
  const betaLogs = [];
  main({
    argv: ["--dry-run"],
    cwd: tempRepo,
    packagePath: path.join(tempRepo, "desktop", "package.json"),
    log: (message) => betaLogs.push(message),
  });
  assert.ok(betaLogs.includes("[desktop-release] branch=beta"));
  assert.equal(git(tempRepo, ["tag"]), "");
});
