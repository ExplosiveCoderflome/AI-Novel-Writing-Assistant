const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const desktopPackagePath = path.join(repoRoot, "desktop", "package.json");

function parseArgs(argv) {
  const options = {
    remote: "origin",
    branch: "main",
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
    if (arg === "--remote" && argv[index + 1]) {
      options.remote = argv[index + 1].trim();
      index += 1;
      continue;
    }
    if (arg === "--branch" && argv[index + 1]) {
      options.branch = argv[index + 1].trim();
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log([
    "Usage: node scripts/trigger-desktop-release.cjs [--dry-run] [--remote origin] [--branch main]",
    "",
    "Reads desktop/package.json version, creates tag vX.Y.Z, then pushes the branch and tag",
    "to trigger the GitHub Desktop Release workflow. This script does not build locally.",
  ].join("\n"));
}

function git(args, options = {}) {
  const output = execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

function gitOk(args) {
  try {
    git(args);
    return true;
  } catch (_error) {
    return false;
  }
}

function readDesktopVersion() {
  const packageJson = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `desktop/package.json version must be stable semver like 0.3.2, got ${version || "(empty)"}.`,
    );
  }
  return version;
}

function assertCleanWorkingTree() {
  const status = git(["status", "--porcelain"]);
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash changes before triggering a desktop release.");
  }
}

function assertOnBranch(branch) {
  const currentBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (currentBranch !== branch) {
    throw new Error(`Desktop release must be triggered from ${branch}; current branch is ${currentBranch}.`);
  }
}

function assertTagDoesNotExist(remote, tagName) {
  if (gitOk(["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`])) {
    throw new Error(`Local tag ${tagName} already exists.`);
  }
  const remoteTag = git(["ls-remote", "--tags", remote, tagName]);
  if (remoteTag) {
    throw new Error(`Remote tag ${tagName} already exists on ${remote}.`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const version = readDesktopVersion();
  const tagName = `v${version}`;

  assertCleanWorkingTree();
  assertOnBranch(options.branch);
  assertTagDoesNotExist(options.remote, tagName);

  console.log(`[desktop-release] version=${version}`);
  console.log(`[desktop-release] tag=${tagName}`);
  console.log(`[desktop-release] remote=${options.remote}`);
  console.log(`[desktop-release] branch=${options.branch}`);

  if (options.dryRun) {
    console.log("[desktop-release] dry run passed; no tag or push was performed.");
    return;
  }

  git(["tag", "-a", tagName, "-m", `release: ${tagName}`], { stdio: "inherit" });
  git(["push", options.remote, options.branch], { stdio: "inherit" });
  git(["push", options.remote, tagName], { stdio: "inherit" });
  console.log(`[desktop-release] pushed ${tagName}; GitHub Actions will build and publish the desktop release.`);
}

try {
  main();
} catch (error) {
  console.error(`[desktop-release] ${error.message}`);
  process.exit(1);
}
