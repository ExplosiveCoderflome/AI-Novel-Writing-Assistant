#!/usr/bin/env node
/**
 * Upload already-built desktop artifacts after dual proofs + build manifests pass.
 * Never stages or invokes electron-builder. Use --dry-run to verify without uploading.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { parseArgs } = require("node:util");
const {
  verifyUpload,
  assertAllBuildManifests,
  readVersion,
  resolveArtifactFile,
} = require("./guard.cjs");

const repoRoot = path.resolve(__dirname, "../..");
const defaultBuildsRoot = path.join(repoRoot, ".tmp", "desktop-builds");

function loadYaml() {
  const electronBuilderPackageJson = require.resolve("electron-builder/package.json", {
    paths: [path.join(repoRoot, "desktop"), repoRoot],
  });
  return createRequire(electronBuilderPackageJson)("js-yaml");
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", default: false },
      "builds-root": { type: "string", default: defaultBuildsRoot },
    },
    strict: true,
  });
  return {
    dryRun: values["dry-run"] === true,
    buildsRoot: path.resolve(repoRoot, values["builds-root"]),
  };
}

function mergeMacLatestYml(macX64Dir, macArm64Dir) {
  const yaml = loadYaml();
  const x64Path = path.join(macX64Dir, "latest-mac.yml");
  const arm64Path = path.join(macArm64Dir, "latest-mac.yml");
  const x64Doc = yaml.load(fs.readFileSync(x64Path, "utf8"));
  const arm64Doc = yaml.load(fs.readFileSync(arm64Path, "utf8"));
  if (!x64Doc || !arm64Doc || x64Doc.version !== arm64Doc.version) {
    throw new Error("macOS update metadata versions must match before merge.");
  }
  const byUrl = new Map();
  for (const entry of [...(x64Doc.files || []), ...(arm64Doc.files || [])]) {
    if (!entry?.url || typeof entry.url !== "string") {
      throw new Error("macOS update metadata entries must include a file url.");
    }
    byUrl.set(entry.url, entry);
  }
  const files = [...byUrl.values()].sort((left, right) => String(left.url).localeCompare(String(right.url)));
  if (files.length < 2) {
    throw new Error("Merged latest-mac.yml must include both macOS architectures.");
  }
  const primary = files.find((entry) => String(entry.url).includes("arm64")) || files[0];
  return `${yaml.dump({
    version: arm64Doc.version,
    files,
    path: primary.url,
    sha512: primary.sha512,
    releaseDate: arm64Doc.releaseDate || x64Doc.releaseDate || new Date().toISOString(),
  }, { lineWidth: -1 }).trim()}\n`;
}

function collectUploadPlan(buildsRoot, manifests) {
  const plan = [];
  for (const [platformKey, manifest] of Object.entries(manifests)) {
    const distDir = path.join(buildsRoot, platformKey);
    for (const file of manifest.files) {
      if (platformKey.startsWith("mac-") && file.name === "latest-mac.yml") {
        continue;
      }
      const { target } = resolveArtifactFile(distDir, file.name);
      plan.push({
        source: target,
        name: file.name,
        platformKey,
        sha256: file.sha256,
      });
    }
  }
  const mergedMacYml = mergeMacLatestYml(
    path.join(buildsRoot, "mac-x64"),
    path.join(buildsRoot, "mac-arm64"),
  );
  const mergedPath = path.join(buildsRoot, "latest-mac.yml");
  fs.writeFileSync(mergedPath, mergedMacYml, "utf8");
  plan.push({
    source: mergedPath,
    name: "latest-mac.yml",
    platformKey: "mac-merged",
    sha256: null,
  });
  const names = new Set();
  for (const item of plan) {
    if (names.has(item.name)) {
      throw new Error(`Duplicate release asset name in upload plan: ${item.name}`);
    }
    names.add(item.name);
  }
  return plan;
}

function ensureRelease(tag, dryRun) {
  if (dryRun) {
    console.log(`[desktop-release] dry-run: would ensure GitHub release ${tag}`);
    return;
  }
  try {
    execFileSync("gh", ["release", "view", tag, "--json", "tagName"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch {
    execFileSync("gh", ["release", "create", tag, "--title", tag, "--notes", ""], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
}

function uploadAssets(tag, plan, dryRun) {
  if (dryRun) {
    for (const item of plan) {
      console.log(`[desktop-release] dry-run: would upload ${item.name} from ${item.source}`);
    }
    return;
  }
  for (const item of plan) {
    execFileSync("gh", ["release", "upload", tag, `${item.source}#${item.name}`, "--clobber"], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
}

function main() {
  const options = parseCli(process.argv.slice(2));
  const env = process.env;
  if (env.GITHUB_ACTIONS === "true" && env.GITHUB_REF_TYPE !== "tag" && !options.dryRun) {
    throw new Error("Public desktop uploads require a version tag, not workflow dispatch on a branch.");
  }
  const tag = verifyUpload(repoRoot, { env, runChecks: () => {}, forceTests: false });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const version = readVersion(repoRoot);
  const manifests = assertAllBuildManifests(repoRoot, env, head, version, options.buildsRoot);
  const plan = collectUploadPlan(options.buildsRoot, manifests);
  console.log(`[desktop-release] verified ${plan.length} release assets for ${tag}`);
  ensureRelease(tag, options.dryRun);
  uploadAssets(tag, plan, options.dryRun);
  console.log(`[desktop-release] ${options.dryRun ? "dry-run verified" : "uploaded"} artifacts for ${tag}`);
}

module.exports = {
  mergeMacLatestYml,
  collectUploadPlan,
  parseCli,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[desktop-release] ${error.message}`);
    process.exitCode = 1;
  }
}
