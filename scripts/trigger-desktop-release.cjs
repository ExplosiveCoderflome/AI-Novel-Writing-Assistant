const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseDesktopReleaseVersion } = require("../desktop/scripts/release-contract.cjs");

const repoRoot = path.resolve(__dirname, "..");
const desktopPackagePath = path.join(repoRoot, "desktop", "package.json");

function parseArgs(argv) {
  const options = {
    remote: "origin",
    branch: "",
    channel: "",
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--remote" || arg === "--branch" || arg === "--channel") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      options[arg.slice(2)] = value.trim();
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp(log = console.log) {
  log([
    "Usage: node scripts/trigger-desktop-release.cjs [--dry-run] [--remote origin] [--branch beta|main] [--channel beta|latest]",
    "",
    "Reads desktop/package.json, derives the exact v<version> tag, and atomically pushes",
    "the expected branch plus tag. X.Y.Z-beta.N uses beta; X.Y.Z uses main.",
    "The branch and channel options may confirm the derived values but cannot override them.",
  ].join("\n"));
}

function createGitRunner(cwd = repoRoot) {
  return (args, options = {}) => {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
    });
    return typeof output === "string" ? output.trim() : "";
  };
}

function gitOk(runGit, args) {
  try {
    runGit(args);
    return true;
  } catch (_error) {
    return false;
  }
}

function readDesktopVersion(packagePath = desktopPackagePath) {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  return parseDesktopReleaseVersion(version).version;
}

function resolveReleasePlan(version, { branch = "", channel = "" } = {}) {
  const parsed = parseDesktopReleaseVersion(version);
  const expectedBranch = parsed.mode === "beta" ? "beta" : "main";

  if (branch && branch !== expectedBranch) {
    throw new Error(
      `Desktop ${parsed.mode} version ${parsed.version} must be released from ${expectedBranch}; got ${branch}.`,
    );
  }
  if (channel && channel !== parsed.updateChannel) {
    throw new Error(
      `Desktop ${parsed.mode} version ${parsed.version} must use ${parsed.updateChannel}; got ${channel}. `
      + "The legacy release channel is not supported.",
    );
  }

  return {
    ...parsed,
    branch: expectedBranch,
  };
}

function assertTagMatchesVersion(tagName, version) {
  const plan = resolveReleasePlan(version);
  const normalizedTag = typeof tagName === "string" ? tagName.trim() : "";
  if (normalizedTag !== plan.tag) {
    throw new Error(
      `Desktop release tag must exactly match ${plan.tag}; got ${normalizedTag || "(empty)"}. `
      + "Prefixes such as desktop-v* are not supported.",
    );
  }
  return normalizedTag;
}

function assertCleanWorkingTree(runGit) {
  const status = runGit(["status", "--porcelain"]);
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash changes before triggering a desktop release.");
  }
}

function assertCommitInBranchHistory(runGit, commitish, branch) {
  const branchRef = `refs/heads/${branch}`;
  if (!gitOk(runGit, ["rev-parse", "--verify", branchRef])) {
    throw new Error(`Required local branch ${branch} does not exist.`);
  }
  if (!gitOk(runGit, ["merge-base", "--is-ancestor", commitish, branchRef])) {
    throw new Error(`${commitish} is not in ${branch} branch history.`);
  }
}

function assertHeadOnExpectedBranch(runGit, branch) {
  const currentBranch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (currentBranch !== branch) {
    throw new Error(`Desktop release must be triggered from ${branch}; current branch is ${currentBranch}.`);
  }

  const headCommit = runGit(["rev-parse", "HEAD"]);
  const branchCommit = runGit(["rev-parse", `refs/heads/${branch}`]);
  if (headCommit !== branchCommit) {
    throw new Error(`HEAD must be the ${branch} branch tip before creating a desktop release tag.`);
  }
  assertCommitInBranchHistory(runGit, headCommit, branch);
  return headCommit;
}

function assertTagInExpectedBranchHistory(runGit, tagName, version) {
  const plan = resolveReleasePlan(version);
  assertTagMatchesVersion(tagName, plan.version);
  const tagCommit = runGit(["rev-parse", "--verify", `${tagName}^{commit}`]);
  assertCommitInBranchHistory(runGit, tagCommit, plan.branch);
  return tagCommit;
}

function assertTagDoesNotExist(runGit, remote, tagName) {
  if (gitOk(runGit, ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`])) {
    throw new Error(`Local tag ${tagName} already exists.`);
  }
  const remoteTag = runGit(["ls-remote", "--tags", remote, `refs/tags/${tagName}`]);
  if (remoteTag) {
    throw new Error(`Remote tag ${tagName} already exists on ${remote}.`);
  }
}

function buildAtomicPushArgs(remote, branch, tagName) {
  return [
    "push",
    "--atomic",
    remote,
    `refs/heads/${branch}:refs/heads/${branch}`,
    `refs/tags/${tagName}:refs/tags/${tagName}`,
  ];
}

function main({
  argv = process.argv.slice(2),
  cwd = repoRoot,
  packagePath = desktopPackagePath,
  log = console.log,
} = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp(log);
    return;
  }

  const version = readDesktopVersion(packagePath);
  const plan = resolveReleasePlan(version, options);
  const runGit = createGitRunner(cwd);

  assertCleanWorkingTree(runGit);
  assertHeadOnExpectedBranch(runGit, plan.branch);
  assertTagDoesNotExist(runGit, options.remote, plan.tag);

  log(`[desktop-release] version=${plan.version}`);
  log(`[desktop-release] tag=${plan.tag}`);
  log(`[desktop-release] remote=${options.remote}`);
  log(`[desktop-release] branch=${plan.branch}`);
  log(`[desktop-release] channel=${plan.updateChannel}`);

  if (options.dryRun) {
    log("[desktop-release] dry run passed; no tag or push was performed.");
    return;
  }

  runGit(["tag", "-a", plan.tag, "-m", `release: ${plan.tag}`], { stdio: "inherit" });
  assertTagInExpectedBranchHistory(runGit, plan.tag, plan.version);
  runGit(buildAtomicPushArgs(options.remote, plan.branch, plan.tag), { stdio: "inherit" });
  log(`[desktop-release] atomically pushed ${plan.branch} and ${plan.tag}; GitHub Actions will publish the desktop release.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[desktop-release] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  assertCleanWorkingTree,
  assertCommitInBranchHistory,
  assertHeadOnExpectedBranch,
  assertTagDoesNotExist,
  assertTagInExpectedBranchHistory,
  assertTagMatchesVersion,
  buildAtomicPushArgs,
  createGitRunner,
  main,
  parseArgs,
  readDesktopVersion,
  resolveReleasePlan,
};
