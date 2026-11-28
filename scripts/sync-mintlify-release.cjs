const fs = require("node:fs");
const path = require("node:path");

const owner = "ExplosiveCoderflome";
const repository = "AI-Novel-Writing-Assistant";
const releaseBase = `https://github.com/${owner}/${repository}/releases/download`;
const platforms = ["setup-x64.exe", "portable-x64.exe", "mac-arm64.dmg", "mac-x64.dmg", "linux-x86_64.AppImage"];
const languages = [
  { prefix: "mintlify-docs", summaryKey: "zh", homepageLabels: 1, downloadCopy: /(?<=下载 \*\*)v\d+\.\d+\.\d+(?=\*\*)/g },
  { prefix: "mintlify-docs/en", summaryKey: "en", homepageLabels: 2, downloadCopy: /(?<=download \*\*)v\d+\.\d+\.\d+(?=\*\*)/g },
];
const homepageBadge = /v\d+\.\d+\.\d+(?=\s*·\s*(?:开源|AGPL-3\.0))/g;

function parseStableTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match) throw new Error(`Not a stable release tag: ${tag || "(empty)"}`);
  return match.slice(1).map(BigInt);
}

function isNewer(left, right) {
  const candidate = parseStableTag(left);
  const target = parseStableTag(right);
  const different = candidate.findIndex((part, index) => part !== target[index]);
  return different !== -1 && candidate[different] > target[different];
}

function verifiedDownloads(release, tag) {
  if (!release || release.tag_name !== tag || release.draft !== false || release.prerelease !== false) {
    throw new Error(`Release ${tag} is missing, draft, prerelease, or tag-mismatched.`);
  }
  const downloads = new Map();
  const missing = [];
  for (const platform of platforms) {
    const name = `Biz-Novel-Studio-${tag.slice(1)}-${platform}`;
    const url = `${releaseBase}/${tag}/${name}`;
    const asset = release.assets?.find((item) => (
      item.name === name && item.state === "uploaded" && item.size > 0 && item.browser_download_url === url
    ));
    if (asset) downloads.set(platform, asset.browser_download_url);
    else missing.push(name);
  }
  if (missing.length) throw new Error(`Release ${tag} is missing verified downloads: ${missing.join(", ")}`);
  return downloads;
}

function replaceVersionCopy(source, pattern, tag, expected, currentTags) {
  let count = 0;
  const result = source.replace(pattern, (currentTag) => {
    count += 1;
    currentTags.add(currentTag);
    return tag;
  });
  if (count !== expected) throw new Error(`Expected ${expected} version labels, found ${count}.`);
  return result;
}

function updateInstallation(source, tag, downloads, downloadCopy, currentTags) {
  const hrefPattern = /href=(["'])https:\/\/github\.com\/ExplosiveCoderflome\/AI-Novel-Writing-Assistant\/releases\/download\/(v\d+\.\d+\.\d+)\/Biz-Novel-Studio-(\d+\.\d+\.\d+)-([^"']+)\1/g;
  const found = new Set();
  const result = source.replace(hrefPattern, (whole, quote, currentTag, filenameVersion, platform) => {
    if (!downloads.has(platform)) return whole;
    if (found.has(platform)) throw new Error(`Duplicate download link for ${platform}.`);
    found.add(platform);
    currentTags.add(currentTag);
    currentTags.add(`v${filenameVersion}`);
    return `href=${quote}${downloads.get(platform)}${quote}`;
  });
  const missing = platforms.filter((platform) => !found.has(platform));
  if (missing.length) throw new Error(`Missing download links: ${missing.join(", ")}`);
  return replaceVersionCopy(result, downloadCopy, tag, 1, currentTags);
}

function readSummary(root, tag) {
  const file = `docs/releases/mintlify/${tag}.json`;
  let text;
  try {
    text = fs.readFileSync(path.join(root, file), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const annotation = process.env.GITHUB_ACTIONS === "true" ? "::warning::" : "Warning: ";
    console.warn(`${annotation}Missing ${file}. Add the bilingual summary and rerun to update the changelogs.`);
    return null;
  }
  try {
    const summary = JSON.parse(text);
    for (const { summaryKey } of languages) {
      const bullets = summary?.[summaryKey];
      if (!Array.isArray(bullets) || !bullets.length || bullets.some((bullet) => typeof bullet !== "string" || !bullet.trim() || /[\r\n]/.test(bullet))) {
        throw new Error(`"${summaryKey}" must contain a nonempty array of single-line bullets.`);
      }
    }
    return summary;
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

function updateChangelog(source, tag, date, bullets) {
  const entries = [...source.matchAll(/^<Update\b[^>]*\bdescription=(["'])(v\d+\.\d+\.\d+)\1[^>]*>/gm)];
  if (entries.some((entry) => entry[2] === tag)) return source;
  if (!entries.length) throw new Error("No versioned Update entries found.");

  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const entry = [
    `<Update label="${date}" description="${tag}">`, "",
    ...bullets.map((bullet) => `- ${bullet.trim()}`), "",
    "</Update>", "", "",
  ].join(eol);
  const first = entries[0].index;
  return source.slice(0, first) + entry + source.slice(first);
}

async function fetchRelease(tag) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repository}/releases/tags/${encodeURIComponent(tag)}`, { headers });
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status}).`);
  return response.json();
}

function planChange(root, file, update) {
  const location = path.join(root, file);
  try {
    const before = fs.readFileSync(location, "utf8");
    return { file, location, before, after: update(before) };
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}

function printChanges(before, after) {
  const oldLines = before.split(/\r?\n/);
  const newLines = after.split(/\r?\n/);
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start += 1;
  while (oldLines.length > start && newLines.length > start && oldLines.at(-1) === newLines.at(-1)) {
    oldLines.pop();
    newLines.pop();
  }
  if (oldLines.length !== newLines.length) {
    for (const line of oldLines.slice(start)) console.log(`- ${line}`);
    for (const line of newLines.slice(start)) console.log(`+ ${line}`);
    return;
  }
  for (let index = start; index < oldLines.length; index += 1) {
    if (oldLines[index] === newLines[index]) continue;
    console.log(`- ${oldLines[index]}`);
    console.log(`+ ${newLines[index]}`);
  }
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
      console.log("Usage: node scripts/sync-mintlify-release.cjs --tag vX.Y.Z [--dry-run] [--release-file fixture.json] [--root repo-root]");
      return;
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!tag) throw new Error("--tag is required.");
  parseStableTag(tag);
  const release = releaseFile ? JSON.parse(fs.readFileSync(releaseFile, "utf8")) : await fetchRelease(tag);
  const downloads = verifiedDownloads(release, tag);
  const published = Date.parse(release.published_at);
  if (!Number.isFinite(published)) throw new Error(`Release ${tag} has no valid publication date.`);
  const currentTags = new Set();
  const changes = languages.flatMap(({ prefix, downloadCopy, homepageLabels }) => [
    planChange(root, `${prefix}/index.mdx`, (source) => replaceVersionCopy(source, homepageBadge, tag, homepageLabels, currentTags)),
    planChange(root, `${prefix}/installation.mdx`, (source) => updateInstallation(source, tag, downloads, downloadCopy, currentTags)),
  ]);
  const newerTag = [...currentTags].find((currentTag) => isNewer(currentTag, tag));
  if (newerTag) {
    console.log(`Skipping ${tag}: the documentation already references newer release ${newerTag}.`);
    return;
  }

  const summary = readSummary(root, tag);
  if (summary) {
    const date = new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeZone: "Asia/Shanghai" }).format(published);
    for (const { prefix, summaryKey } of languages) {
      changes.push(planChange(root, `${prefix}/changelog.mdx`, (source) => updateChangelog(source, tag, date, summary[summaryKey])));
    }
  }

  for (const { file, location, before, after } of changes) {
    if (before === after) continue;
    console.log(`${dryRun ? "Would update" : "Updating"} ${file} for ${tag}`);
    if (dryRun) printChanges(before, after);
    else fs.writeFileSync(location, after);
  }
  if (!dryRun) console.log(`Mintlify release documentation processed for ${tag}.`);
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`[mintlify-release-sync] ${error.message}`);
  process.exitCode = 1;
});
