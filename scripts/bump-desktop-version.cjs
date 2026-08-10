const fs = require("node:fs");
const path = require("node:path");
const {
  compareDesktopReleaseVersions,
  parseDesktopReleaseVersion,
} = require("../desktop/scripts/release-contract.cjs");

const repoRoot = path.resolve(__dirname, "..");
const desktopPackagePath = path.join(repoRoot, "desktop", "package.json");

function printHelp() {
  console.log([
    "Usage: node scripts/bump-desktop-version.cjs [--dry-run] X.Y.Z[-beta.N]",
    "",
    "Updates desktop/package.json version before a desktop package release.",
    "Use X.Y.Z for a stable release or X.Y.Z-beta.N for a public beta.",
    "Do not include a leading v or a desktop-v prefix.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    version: "",
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (options.version) {
      throw new Error(`Unexpected extra version argument: ${arg}`);
    }
    options.version = arg.trim();
  }

  return options;
}

function readDesktopPackageJson() {
  return JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));
}

function resolveVersionPlan(version) {
  const parsed = parseDesktopReleaseVersion(version);
  return {
    ...parsed,
    branch: parsed.mode === "beta" ? "beta" : "main",
  };
}

function assertVersionUpgrade(currentVersion, targetVersion) {
  const current = resolveVersionPlan(currentVersion);
  const target = resolveVersionPlan(targetVersion);
  if (compareDesktopReleaseVersions(target.version, current.version) <= 0) {
    throw new Error(`Target version ${target.version} must be greater than current version ${current.version}.`);
  }
  return { current, target };
}

function printNextSteps(nextVersion) {
  const plan = resolveVersionPlan(nextVersion);
  const branchGuidance = plan.branch === "beta"
    ? "Commit the beta version and release notes on beta."
    : "Promote the verified beta candidate to main, then commit the stable version and release notes.";
  console.log([
    "",
    "Next release steps:",
    "1. Update docs/releases/release-notes.md and README.md for user-visible changes.",
    `2. ${branchGuidance}`,
    "3. Run: node scripts/trigger-desktop-release.cjs --dry-run",
    `4. Publish ${plan.updateChannel} channel tag ${plan.tag} only after the dry run passes.`,
  ].join("\n"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.version) {
    throw new Error("Missing target version.");
  }

  const packageJson = readDesktopPackageJson();
  const currentVersion = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  const { target } = assertVersionUpgrade(currentVersion, options.version);
  const nextVersion = target.version;

  console.log(`[desktop-version] current=${currentVersion}`);
  console.log(`[desktop-version] next=${nextVersion}`);
  console.log(`[desktop-version] branch=${target.branch}`);
  console.log(`[desktop-version] channel=${target.updateChannel}`);
  console.log(`[desktop-version] tag=${target.tag}`);

  if (options.dryRun) {
    console.log("[desktop-version] dry run passed; desktop/package.json was not changed.");
    printNextSteps(nextVersion);
    return;
  }

  packageJson.version = nextVersion;
  fs.writeFileSync(desktopPackagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  console.log(`[desktop-version] updated desktop/package.json to ${nextVersion}.`);
  printNextSteps(nextVersion);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[desktop-version] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  assertVersionUpgrade,
  main,
  parseArgs,
  printNextSteps,
  resolveVersionPlan,
};
