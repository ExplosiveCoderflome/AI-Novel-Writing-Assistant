const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  CANONICAL_GITHUB_OWNER,
  CANONICAL_GITHUB_REPO,
  parseDesktopReleaseVersion,
} = require("../../desktop/scripts/release-contract.cjs");

function parseArgs(args) {
  const parsed = {};
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!option || !value || !["--tag", "--repository", "--repo-root", "--github-output"].includes(option)) {
      throw new Error(`Invalid release-ref option ${option || "<missing>"}.`);
    }
    if (seen.has(option)) {
      throw new Error(`${option} may only be provided once.`);
    }
    parsed[option] = value;
    seen.add(option);
  }
  for (const required of ["--tag", "--repository"]) {
    if (!parsed[required]) {
      throw new Error(`Missing required option ${required}.`);
    }
  }
  return parsed;
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function validateReleaseRef(options) {
  const repoRoot = path.resolve(options["--repo-root"] || process.cwd());
  const repository = options["--repository"];
  const expectedRepository = `${CANONICAL_GITHUB_OWNER}/${CANONICAL_GITHUB_REPO}`;
  if (repository !== expectedRepository) {
    throw new Error(`Public desktop releases require ${expectedRepository}; got ${repository}.`);
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop", "package.json"), "utf8"));
  const parsedVersion = parseDesktopReleaseVersion(packageJson.version);
  if (options["--tag"] !== parsedVersion.tag) {
    throw new Error(`Tag ${options["--tag"]} must exactly equal desktop version tag ${parsedVersion.tag}.`);
  }

  const branch = parsedVersion.mode === "beta" ? "beta" : "main";
  git(repoRoot, [
    "fetch",
    "--no-tags",
    "origin",
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  ]);
  const tagCommit = git(repoRoot, ["rev-parse", "--verify", `${parsedVersion.tag}^{commit}`]);
  try {
    git(repoRoot, ["merge-base", "--is-ancestor", tagCommit, `refs/remotes/origin/${branch}`]);
  } catch (_error) {
    throw new Error(`${parsedVersion.tag} commit ${tagCommit} is not in origin/${branch} history.`);
  }

  return {
    branch,
    channel: parsedVersion.updateChannel,
    mode: parsedVersion.mode,
    releaseType: parsedVersion.releaseType,
    repository,
    tag: parsedVersion.tag,
    tagCommit,
    version: parsedVersion.version,
  };
}

function appendGithubOutput(filePath, result) {
  if (!filePath) {
    return;
  }
  const lines = Object.entries(result).map(([name, value]) => `${name}=${value}`).join("\n");
  fs.appendFileSync(filePath, `${lines}\n`, "utf8");
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = validateReleaseRef(options);
    appendGithubOutput(options["--github-output"], result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(`[validate-desktop-release-ref] ${error.message}`);
    process.exit(1);
  }
}

module.exports = { appendGithubOutput, parseArgs, validateReleaseRef };
