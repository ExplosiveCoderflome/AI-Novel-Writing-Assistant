const fs = require("node:fs");
const path = require("node:path");
const { parseDesktopReleaseVersion } = require("../desktop/scripts/release-contract.cjs");

const repoRoot = path.resolve(__dirname, "..");
const desktopPackagePath = path.join(repoRoot, "desktop", "package.json");
const releaseNotesPath = path.join(repoRoot, "docs", "releases", "release-notes.md");

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseArgs(argv) {
  const options = {
    help: false,
    outputMode: "stdout",
    writeBodyPath: "",
  };
  let outputWasExplicit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--stdout" || arg === "--dry-run") {
      if (outputWasExplicit && options.outputMode !== "stdout") {
        throw new Error("Choose either stdout rendering or --write-body, not both.");
      }
      options.outputMode = "stdout";
      outputWasExplicit = true;
      continue;
    }
    if (arg === "--write-body") {
      const outputPath = argv[index + 1];
      if (!outputPath || outputPath.startsWith("--")) {
        throw new Error("--write-body requires a file path.");
      }
      if (outputWasExplicit) {
        throw new Error("Choose either stdout rendering or --write-body, not both.");
      }
      options.outputMode = "file";
      options.writeBodyPath = outputPath;
      outputWasExplicit = true;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log([
    "Usage: node scripts/update-desktop-release-notes.cjs [--stdout | --write-body <path>]",
    "",
    "Renders the date-based release notes for desktop/package.json without calling GitHub.",
    "--dry-run remains available as a compatibility alias for --stdout.",
    "Both X.Y.Z and X.Y.Z-beta.N desktop versions are supported.",
  ].join("\n"));
}

function readDesktopVersion(packagePath = desktopPackagePath) {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  return parseDesktopReleaseVersion(version).version;
}

function resolveReleaseTag(version, refName = "") {
  const parsedVersion = parseDesktopReleaseVersion(version);
  const expectedTag = `v${parsedVersion.version}`;
  const configuredRefName = firstNonEmpty(refName);
  if (configuredRefName && configuredRefName !== expectedTag) {
    throw new Error(
      `Desktop release tag must exactly match ${expectedTag}; got ${configuredRefName}. `
      + "Prefixes such as desktop-v* are not supported.",
    );
  }
  return expectedTag;
}

function extractDatedReleaseNoteBlocks(markdown) {
  const headingPattern = /^### \d{4}-\d{2}-\d{2}(?:[^\n]*)?$/gm;
  const headings = [...markdown.matchAll(headingPattern)];
  if (headings.length === 0) {
    throw new Error("No date heading like '### 2026-05-08' was found in docs/releases/release-notes.md.");
  }

  return headings.map((heading, index) => {
    const blockStart = heading.index;
    const nextHeading = headings[index + 1];
    const blockEnd = nextHeading ? nextHeading.index : markdown.length;
    return markdown.slice(blockStart, blockEnd).trim();
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractReleaseNotesForVersion(markdown, version) {
  const parsedVersion = parseDesktopReleaseVersion(version);
  const blocks = extractDatedReleaseNoteBlocks(markdown);
  const escapedVersion = escapeRegExp(parsedVersion.version);
  const versionPattern = new RegExp(`(^|[^0-9A-Za-z.-])v?${escapedVersion}(?=$|[^0-9A-Za-z.-])`);
  return blocks.find((block) => versionPattern.test(block)) || blocks[0];
}

function buildReleaseBody(version, notesBlock) {
  const parsedVersion = parseDesktopReleaseVersion(version);
  return [
    "## 本版本更新说明",
    "",
    notesBlock,
    "",
    "---",
    "",
    `桌面客户端版本：v${parsedVersion.version}`,
  ].join("\n");
}

function renderReleaseBody({
  packagePath = desktopPackagePath,
  notesPath = releaseNotesPath,
  refName = process.env.GITHUB_REF_NAME,
} = {}) {
  const version = readDesktopVersion(packagePath);
  resolveReleaseTag(version, refName);
  const markdown = fs.readFileSync(notesPath, "utf8");
  const notesBlock = extractReleaseNotesForVersion(markdown, version);
  return buildReleaseBody(version, notesBlock);
}

function main({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  packagePath = desktopPackagePath,
  notesPath = releaseNotesPath,
  refName = process.env.GITHUB_REF_NAME,
} = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  const body = renderReleaseBody({ packagePath, notesPath, refName });
  if (options.outputMode === "file") {
    const outputPath = path.resolve(cwd, options.writeBodyPath);
    fs.writeFileSync(outputPath, `${body}\n`, "utf8");
    return;
  }
  process.stdout.write(`${body}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[desktop-release-notes] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildReleaseBody,
  escapeRegExp,
  extractDatedReleaseNoteBlocks,
  extractReleaseNotesForVersion,
  main,
  parseArgs,
  readDesktopVersion,
  renderReleaseBody,
  resolveReleaseTag,
};
