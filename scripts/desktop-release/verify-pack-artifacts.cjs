#!/usr/bin/env node
/**
 * Non-publish pack verification: re-hash downloaded platform artifacts, bind
 * latest*.yml digests, merge dual-arch latest-mac.yml, and print the upload plan.
 * Never creates tags, never calls GitHub Releases, never stages or rebuilds.
 */
const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const {
  assertAllBuildManifests,
  readVersion,
} = require("./guard.cjs");
const { collectUploadPlan } = require("./publish-artifacts.cjs");

const repoRoot = path.resolve(__dirname, "../..");
const defaultBuildsRoot = path.join(repoRoot, ".tmp", "desktop-builds");

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "builds-root": { type: "string", default: defaultBuildsRoot },
    },
    strict: true,
  });
  return {
    buildsRoot: path.resolve(repoRoot, values["builds-root"]),
  };
}

function gitHead(root) {
  const { execFileSync } = require("node:child_process");
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

function main(argv = process.argv.slice(2), env = process.env) {
  if (env.AI_NOVEL_PACK_VERIFY_ALLOW_UPLOAD === "1") {
    throw new Error("Pack verify must not enable upload; refuse AI_NOVEL_PACK_VERIFY_ALLOW_UPLOAD=1.");
  }
  const options = parseCli(argv);
  if (!env.GITHUB_RUN_ID || !env.GITHUB_RUN_ATTEMPT) {
    throw new Error("Pack verify requires GITHUB_RUN_ID and GITHUB_RUN_ATTEMPT from the current Actions run.");
  }
  const head = gitHead(repoRoot);
  const version = readVersion(repoRoot);
  const manifests = assertAllBuildManifests(repoRoot, env, head, version, options.buildsRoot);
  const plan = collectUploadPlan(options.buildsRoot, manifests);
  const mergedMac = fs.readFileSync(path.join(options.buildsRoot, "latest-mac.yml"), "utf8");
  if (!/mac-x64\.dmg/.test(mergedMac) || !/mac-arm64\.dmg/.test(mergedMac)) {
    throw new Error("Merged latest-mac.yml must include both macOS architecture package names.");
  }
  if (!plan.some((item) => item.name === "latest-mac.yml" && item.platformKey === "mac-merged")) {
    throw new Error("Upload plan must include a single merged latest-mac.yml after packages.");
  }
  const packageNames = plan.filter((item) => !item.name.endsWith(".yml")).map((item) => item.name);
  for (const required of [
    "-setup-x64.exe",
    "-portable-x64.exe",
    "-mac-x64.dmg",
    "-mac-arm64.dmg",
    "-linux-x86_64.AppImage",
  ]) {
    if (!packageNames.some((name) => name.endsWith(required))) {
      throw new Error(`Pack verify plan is missing required package ending with ${required}.`);
    }
  }
  console.log(`[desktop-release] pack verify passed for ${version} @ ${head}`);
  console.log(`[desktop-release] planned artifacts (${plan.length}, packages-first):`);
  for (const item of plan) {
    console.log(`  - ${item.platformKey}: ${item.name}`);
  }
  return { head, version, manifests, plan };
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[desktop-release] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
