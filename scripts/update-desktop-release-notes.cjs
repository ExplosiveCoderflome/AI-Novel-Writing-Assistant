const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

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
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
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

function printHelp() {
  console.log([
    "Usage: node scripts/update-desktop-release-notes.cjs [--dry-run]",
    "",
    "Reads the date block for the current desktop/package.json version and writes",
    "it to the matching GitHub Release. Falls back to the latest date block.",
  ].join("\n"));
}

function readDesktopVersion() {
  const packageJson = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));
  const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `desktop/package.json version must be stable semver like 0.3.3, got ${version || "(empty)"}.`,
    );
  }
  return version;
}

function resolveReleaseTag(version) {
  const refName = firstNonEmpty(process.env.GITHUB_REF_NAME);
  if (/^v\d+\.\d+\.\d+$/.test(refName)) {
    return refName;
  }
  return `v${version}`;
}

function extractDatedReleaseNoteBlocks(markdown) {
  const headingPattern = /^### \d{4}-\d{2}-\d{2}\s*$/gm;
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

function extractReleaseNotesForVersion(markdown, version) {
  const blocks = extractDatedReleaseNoteBlocks(markdown);
  const versionPattern = new RegExp(`(^|[^\\d])v?${version.replace(/\./g, "\\.")}([^\\d]|$)`);
  const versionBlock = blocks.find((block) => versionPattern.test(block));
  const block = versionBlock || blocks[0];
  if (!block) {
    throw new Error("Latest release notes block is empty.");
  }
  return block;
}

function buildReleaseBody(version, notesBlock) {
  return [
    "## 本版本更新说明",
    "",
    notesBlock,
    "",
    "---",
    "",
    `桌面客户端版本：v${version}`,
  ].join("\n");
}

function githubRequest({ owner, repo, token, method, path: requestPath, body }) {
  const payload = body == null ? null : JSON.stringify(body);
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "ai-novel-desktop-release-notes",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (payload != null) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "api.github.com",
      method,
      path: `/repos/${owner}/${repo}${requestPath}`,
      headers,
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        let parsed = null;
        if (responseBody) {
          try {
            parsed = JSON.parse(responseBody);
          } catch (_error) {
            parsed = responseBody;
          }
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GitHub API ${method} ${requestPath} failed with ${response.statusCode}: ${responseBody}`));
          return;
        }

        resolve(parsed);
      });
    });

    request.on("error", reject);
    if (payload != null) {
      request.write(payload);
    }
    request.end();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const version = readDesktopVersion();
  const tagName = resolveReleaseTag(version);
  const releaseNotes = extractReleaseNotesForVersion(fs.readFileSync(releaseNotesPath, "utf8"), version);
  const body = buildReleaseBody(version, releaseNotes);

  const owner = firstNonEmpty(process.env.AI_NOVEL_GITHUB_OWNER, process.env.GITHUB_REPOSITORY_OWNER);
  const repo = firstNonEmpty(
    process.env.AI_NOVEL_GITHUB_REPO,
    process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.split("/")[1],
  );
  const token = firstNonEmpty(process.env.GH_TOKEN, process.env.GITHUB_TOKEN);

  console.log(`[desktop-release-notes] tag=${tagName}`);
  console.log(`[desktop-release-notes] version=${version}`);

  if (options.dryRun) {
    console.log(body);
    return;
  }

  if (!owner || !repo) {
    throw new Error("GitHub owner/repo is missing. Set AI_NOVEL_GITHUB_OWNER and AI_NOVEL_GITHUB_REPO.");
  }
  if (!token) {
    throw new Error("GitHub token is missing. Set GH_TOKEN or GITHUB_TOKEN.");
  }

  const release = await githubRequest({
    owner,
    repo,
    token,
    method: "GET",
    path: `/releases/tags/${encodeURIComponent(tagName)}`,
  });

  await githubRequest({
    owner,
    repo,
    token,
    method: "PATCH",
    path: `/releases/${release.id}`,
    body: {
      body,
      name: version,
    },
  });

  console.log(`[desktop-release-notes] updated GitHub Release ${tagName}.`);
}

main().catch((error) => {
  console.error(`[desktop-release-notes] ${error.message}`);
  process.exit(1);
});
