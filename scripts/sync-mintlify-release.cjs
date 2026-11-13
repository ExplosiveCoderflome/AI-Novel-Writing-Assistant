const fs = require("node:fs");
const path = require("node:path");

const owner = "ExplosiveCoderflome";
const repository = "AI-Novel-Writing-Assistant";
const assetPatterns = [
  "Biz-Novel-Studio-{version}-setup-x64.exe",
  "Biz-Novel-Studio-{version}-portable-x64.exe",
  "Biz-Novel-Studio-{version}-mac-arm64.dmg",
  "Biz-Novel-Studio-{version}-mac-x64.dmg",
  "Biz-Novel-Studio-{version}-linux-x86_64.AppImage",
];

function parseStableTag(tag) {
  const match = /^v(\d+\.\d+\.\d+)$/.exec(tag || "");
  if (!match) throw new Error(`Not a stable release tag: ${tag || "(empty)"}`);
  return match[1];
}

function assertCompleteRelease(release, tag) {
  const version = parseStableTag(tag);
  if (!release || release.tag_name !== tag || release.draft || release.prerelease) {
    throw new Error(`Release ${tag} is missing, draft, prerelease, or tag-mismatched.`);
  }
  const names = new Set((release.assets || []).map((asset) => asset.name));
  const missing = assetPatterns
    .map((pattern) => pattern.replace("{version}", version))
    .filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Release ${tag} is missing assets: ${missing.join(", ")}`);
  return version;
}

function updateInstallation(source, version) {
  const expected = assetPatterns.map((pattern) => pattern.replace("{version}", version));
  const hrefPattern = /href="https:\/\/github\.com\/ExplosiveCoderflome\/AI-Novel-Writing-Assistant\/releases\/download\/v(\d+\.\d+\.\d+)\/(Biz-Novel-Studio-[^"]+)"/g;
  const found = new Set();
  const result = source.replace(hrefPattern, (whole, currentVersion, filename) => {
    if (!assetPatterns.some((pattern) => pattern.replace("{version}", currentVersion) === filename)) return whole;
    if (found.has(filename)) throw new Error(`Duplicate installation asset link: ${filename}`);
    found.add(filename);
    const targetName = assetPatterns.find((pattern) => pattern.replace("{version}", currentVersion) === filename)
      .replace("{version}", version);
    return `href="https://github.com/${owner}/${repository}/releases/download/v${version}/${targetName}"`;
  });
  if (found.size !== assetPatterns.length) {
    throw new Error("Installation page must contain exactly one link for each of the five supported assets.");
  }
  return result;
}

function updateHomepage(source, version) {
  const result = source.replace(/v\d+\.\d+\.\d+(?=\s*·\s*(?:开源|AGPL-3\.0))/g, `v${version}`);
  if (result === source && !new RegExp(`v${version}\\s*·\\s*(?:开源|AGPL-3\\.0)`).test(source)) {
    throw new Error("Homepage version badge was not found.");
  }
  return result;
}

async function fetchRelease(tag, token) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" } },
  );
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status}).`);
  return response.json();
}

async function main(argv) {
  let tag = "";
  let dryRun = false;
  let releaseFile = "";
  let root = process.env.DOCS_SYNC_ROOT || path.resolve(__dirname, "..");
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--tag") tag = argv[++index] || "";
    else if (argv[index] === "--release-file") releaseFile = argv[++index] || "";
    else if (argv[index] === "--root") root = path.resolve(argv[++index] || "");
    else if (argv[index] === "--dry-run") dryRun = true;
    else if (argv[index] === "--help" || argv[index] === "-h") {
      console.log("Usage: node scripts/sync-mintlify-release.cjs --tag vX.Y.Z [--dry-run] [--release-file fixture.json] [--root docs-root]");
      return;
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!tag) throw new Error("--tag is required.");
  let release;
  if (releaseFile) {
    release = JSON.parse(fs.readFileSync(path.resolve(releaseFile), "utf8"));
  } else {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is required to verify uploaded release assets.");
    release = await fetchRelease(tag, token);
  }
  const version = assertCompleteRelease(release, tag);
  const installationPath = path.join(root, "mintlify-docs", "installation.mdx");
  const homepagePath = path.join(root, "mintlify-docs", "index.mdx");
  const oldInstallation = fs.readFileSync(installationPath, "utf8");
  const oldHomepage = fs.readFileSync(homepagePath, "utf8");
  const newInstallation = updateInstallation(oldInstallation, version);
  const newHomepage = updateHomepage(oldHomepage, version);
  const changes = [[installationPath, oldInstallation, newInstallation], [homepagePath, oldHomepage, newHomepage]];

  for (const [file, before, after] of changes) {
    if (before === after) continue;
    console.log(`${dryRun ? "Would update" : "Updating"} ${path.relative(root, file)} for ${tag}`);
    if (dryRun) {
      const oldLines = before.split("\n");
      const newLines = after.split("\n");
      for (let line = 0; line < Math.max(oldLines.length, newLines.length); line += 1) {
        if (oldLines[line] !== newLines[line]) {
          if (oldLines[line] !== undefined) console.log(`- ${oldLines[line]}`);
          if (newLines[line] !== undefined) console.log(`+ ${newLines[line]}`);
        }
      }
    }
  }
  if (dryRun) return;
  for (const [file, before, after] of changes) if (before !== after) fs.writeFileSync(file, after);
  console.log(`Mintlify release documents synchronized for ${tag}.`);
}

module.exports = { assertCompleteRelease, parseStableTag, updateHomepage, updateInstallation };

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[mintlify-release-sync] ${error.message}`);
    process.exitCode = 1;
  });
}
