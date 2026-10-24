const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const desktopPackagePath = path.join(repoRoot, "desktop", "package.json");
const stableTagPattern = /^v(\d+\.\d+\.\d+)$/;
const channelTagPattern = /^(?:desktop-beta-|desktop-)?v(\d+\.\d+\.\d+)$/;

function parseArgs(argv) {
  const options = {
    tag: "",
    requireStable: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--tag") {
      options.tag = String(argv[index + 1] ?? "").trim();
      index += 1;
      continue;
    }
    if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length).trim();
      continue;
    }
    if (arg === "--require-stable") {
      options.requireStable = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readDesktopVersion() {
  const packageJson = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`desktop/package.json version must be stable semver like 0.5.20, got "${version}".`);
  }
  return version;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log("Usage: node scripts/check-desktop-release-tag.cjs [--tag <ref>] [--require-stable]");
    console.log("");
    console.log("  --tag             Release ref to validate. Defaults to GITHUB_REF_NAME.");
    console.log("  --require-stable  Fail when the ref is not a strict vX.Y.Z public release tag.");
    return;
  }

  const version = readDesktopVersion();
  const tag = options.tag || process.env.GITHUB_REF_NAME?.trim() || "";
  if (!tag) {
    throw new Error("No release tag was provided and GITHUB_REF_NAME is not set.");
  }

  const stableMatch = stableTagPattern.exec(tag);
  if (stableMatch) {
    if (stableMatch[1] !== version) {
      throw new Error(`Release tag ${tag} does not match desktop/package.json version ${version}.`);
    }
    console.log(`[desktop-release-tag] ${tag} matches desktop/package.json version ${version}.`);
    return;
  }

  const channelMatch = channelTagPattern.exec(tag);
  if (channelMatch) {
    if (channelMatch[1] !== version) {
      throw new Error(`Release tag ${tag} does not match desktop/package.json version ${version}.`);
    }
    console.log(`[desktop-release-tag] ${tag} matches desktop/package.json version ${version} (pre-release channel).`);
    return;
  }

  if (options.requireStable) {
    throw new Error(
      `Ref ${tag} is not a vX.Y.Z public release tag. Public desktop releases must use the tag v${version}.`,
    );
  }

  console.warn(
    `[desktop-release-tag] Ref ${tag} is not a version tag; skipping the version match check. Public desktop releases must use v${version}.`,
  );
}

try {
  main();
} catch (error) {
  console.error("[desktop-release-tag] failed.", error);
  process.exit(1);
}
