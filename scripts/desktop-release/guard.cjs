const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const crypto = require("node:crypto");

const releaseChecksArtifactSchema = 1;
const buildManifestSchema = 1;
const releaseChecks = [
  "pnpm typecheck",
  "pnpm --filter @ai-novel/server prisma:deploy",
  "pnpm test:all",
  "pnpm --filter @ai-novel/server test:quality",
  "pnpm --filter @ai-novel/desktop build",
  "pnpm test:release-guards",
];

const platformBuildRequirements = {
  "win-x64": {
    os: "win",
    arch: "x64",
    requiredSuffixes: [
      "-setup-x64.exe",
      "-setup-x64.exe.blockmap",
      "-portable-x64.exe",
    ],
    updateFile: "latest.yml",
  },
  "mac-x64": {
    os: "mac",
    arch: "x64",
    requiredSuffixes: ["-mac-x64.dmg", "-mac-x64.dmg.blockmap"],
    updateFile: "latest-mac.yml",
  },
  "mac-arm64": {
    os: "mac",
    arch: "arm64",
    requiredSuffixes: ["-mac-arm64.dmg", "-mac-arm64.dmg.blockmap"],
    updateFile: "latest-mac.yml",
  },
  "linux-x64": {
    os: "linux",
    arch: "x64",
    requiredSuffixes: ["-linux-x86_64.AppImage"],
    updateFile: "latest-linux.yml",
  },
};

function readVersion(repoRoot) {
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop/package.json"), "utf8")).version;
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("desktop/package.json version must be stable X.Y.Z.");
  }
  return version;
}

function assertReleaseTag(tag, version) {
  if (tag !== `v${version}`) throw new Error(`Release tag must be v${version}; got ${tag || "(missing)"}.`);
}

function gitAt(repoRoot, args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runPnpm(args, options) {
  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, { ...options, shell: process.platform === "win32", stdio: "inherit" });
}

function assertPgLiveProof(repoRoot, env, head) {
  let proof;
  try { proof = JSON.parse(fs.readFileSync(path.join(repoRoot, ".tmp/pg-live-gate.json"), "utf8")); }
  catch { throw new Error("Required PG live gate proof is missing; no publication is allowed."); }
  if (proof.schema !== 1 || proof.status !== "passed" || proof.head !== head
    || !env.GITHUB_RUN_ID || proof.runId !== env.GITHUB_RUN_ID
    || !env.GITHUB_RUN_ATTEMPT || proof.runAttempt !== env.GITHUB_RUN_ATTEMPT) {
    throw new Error("Required PG live gate proof must match this revision and workflow run attempt.");
  }
}

function releaseChecksArtifactPath(repoRoot, env) {
  if (!env.GITHUB_RUN_ID || !env.GITHUB_RUN_ATTEMPT) {
    throw new Error("Release checks artifact requires the current GitHub run and attempt.");
  }
  return path.join(repoRoot, ".tmp", "release-checks", `release-checks-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}.json`);
}

function assertTrustedReleaseChecks(repoRoot, env, head, version) {
  let artifact;
  try { artifact = JSON.parse(fs.readFileSync(releaseChecksArtifactPath(repoRoot, env), "utf8")); }
  catch { throw new Error("Trusted release checks artifact is missing; no publication is allowed."); }
  if (artifact.schema !== releaseChecksArtifactSchema
    || artifact.status !== "passed"
    || artifact.head !== head
    || artifact.runId !== env.GITHUB_RUN_ID
    || artifact.runAttempt !== env.GITHUB_RUN_ATTEMPT
    || artifact.desktopVersion !== version
    || JSON.stringify(artifact.checks) !== JSON.stringify(releaseChecks)) {
    throw new Error("Trusted release checks artifact must match this revision, version, workflow run attempt, and check scope.");
  }
  return artifact;
}

function writeTrustedReleaseChecks(repoRoot, env, head, version) {
  const artifactPath = releaseChecksArtifactPath(repoRoot, env);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify({
    schema: releaseChecksArtifactSchema,
    status: "passed",
    head,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    desktopVersion: version,
    checks: releaseChecks,
    passedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  return artifactPath;
}

/** Portable checks only. PG live proof is asserted at upload / verify-proof / CI checkRevision. */
function runReleaseChecks(repoRoot, { run = runPnpm, env = process.env } = {}) {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "anw-release-check-"));
  const options = { cwd: repoRoot, env: { ...env, NODE_ENV: "test", AI_NOVEL_RUNTIME: "web", AI_NOVEL_ACCESS_TOKEN: "",
    AI_NOVEL_DATABASE_MODE: "sqlite", AI_NOVEL_APP_DATA_DIR: path.join(testRoot, "app"),
    DATABASE_URL: `file:${path.join(testRoot, "tests.sqlite").replace(/\\/g, "/")}` } };
  console.log(`[desktop-release] isolated tests: ${testRoot}`);
  for (const args of [
    ["typecheck"],
    ["--filter", "@ai-novel/server", "prisma:deploy"],
    ["test:all"],
    ["--filter", "@ai-novel/server", "test:quality"],
    ["--filter", "@ai-novel/desktop", "build"],
    ["test:release-guards"],
  ]) {
    try { run(args, options); }
    catch (cause) { throw new Error(`Release checks failed: pnpm ${args.join(" ")}. No publication is allowed.`, { cause }); }
  }
  if (env.GITHUB_ACTIONS !== "true") {
    // The PG URL belongs only to this suite, never to the portable SQLite tests.
    try { run(["test:pg-live"], { cwd: repoRoot, env: { ...env } }); }
    catch (cause) { throw new Error("Release checks failed: pnpm test:pg-live. No publication is allowed.", { cause }); }
  }
}

const releaseCheckMarkerSchema = 2;

function releaseCheckMarkerPath(repoRoot, head) {
  return path.join(repoRoot, ".tmp", "desktop-release", `${encodeURIComponent(head)}.json`);
}

function hasPassingReleaseCheck(repoRoot, head, version) {
  try {
    const marker = JSON.parse(fs.readFileSync(releaseCheckMarkerPath(repoRoot, head), "utf8"));
    return marker.schema === releaseCheckMarkerSchema
      && marker.status === "passed"
      && marker.head === head
      && marker.desktopVersion === version;
  } catch (_error) {
    return false;
  }
}

function recordPassingReleaseCheck(repoRoot, head, version) {
  const markerPath = releaseCheckMarkerPath(repoRoot, head);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${JSON.stringify({
    schema: releaseCheckMarkerSchema,
    status: "passed",
    head,
    desktopVersion: version,
    passedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
}

/** Do not tag or upload a revision other than the one that actually passed checks. */
function checkRevision(repoRoot, {
  git = args => gitAt(repoRoot, args),
  runChecks = () => runReleaseChecks(repoRoot),
  forceTests = false,
  recordMarker = true,
  env = process.env,
} = {}) {
  if (git(["status", "--porcelain"])) throw new Error("Working tree must be clean before release checks.");
  const head = git(["rev-parse", "HEAD"]);
  const version = readVersion(repoRoot);
  const reusePassingCheck = !forceTests && hasPassingReleaseCheck(repoRoot, head, version);
  if (reusePassingCheck) {
    console.log(`[desktop-release] reusing passed checks for ${head}; working tree is clean.`);
  } else {
    // A failed rerun must not leave an older pass eligible for the next upload.
    fs.rmSync(releaseCheckMarkerPath(repoRoot, head), { force: true });
    runChecks();
  }
  if (git(["rev-parse", "HEAD"]) !== head || readVersion(repoRoot) !== version || git(["status", "--porcelain"])) {
    throw new Error("The tested revision changed. Run release checks again before tagging or uploading.");
  }
  // workflow_dispatch / CI check entry still require the current run's PG proof.
  if (env.GITHUB_ACTIONS === "true") {
    assertPgLiveProof(repoRoot, env, head);
  }
  if (!reusePassingCheck && recordMarker) recordPassingReleaseCheck(repoRoot, head, version);
  return { head, version };
}

function verifyUpload(repoRoot, {
  env = process.env,
  git = args => gitAt(repoRoot, args),
  runChecks = () => runReleaseChecks(repoRoot),
  forceTests = false,
} = {}) {
  const version = readVersion(repoRoot);
  const tag = `v${version}`;
  if (env.GITHUB_REF_NAME) assertReleaseTag(env.GITHUB_REF_NAME, version);
  if (env.GITHUB_REF && env.GITHUB_REF !== `refs/tags/${tag}`) throw new Error("GitHub release ref does not match the package version.");
  if (env.GITHUB_ACTIONS === "true") {
    if (env.GITHUB_REF_TYPE !== "tag") throw new Error("Public desktop uploads require a version tag, not workflow dispatch on a branch.");
    assertReleaseTag(env.GITHUB_REF_NAME, version);
    if (env.GITHUB_REF !== `refs/tags/${tag}`) throw new Error("GitHub release ref does not match the package version.");
  }
  const head = git(["rev-parse", "HEAD"]);
  if (env.GITHUB_ACTIONS === "true") assertPgLiveProof(repoRoot, env, head);
  if (git(["rev-parse", `refs/tags/${tag}^{commit}`]) !== head) throw new Error(`${tag} must point to the current release commit.`);
  if (env.GITHUB_ACTIONS !== "true") {
    const refs = git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`]).split(/\r?\n/).filter(Boolean).map(line => line.split(/\s+/));
    const remoteHead = refs.find(([, ref]) => ref.endsWith("^{}"))?.[0] ?? refs[0]?.[0];
    if (remoteHead !== head) throw new Error(`Push ${tag} pointing to the tested release commit before uploading.`);
  }
  try { git(["merge-base", "--is-ancestor", "HEAD", env.GITHUB_ACTIONS === "true" ? "refs/remotes/origin/main" : "refs/heads/main"]); }
  catch (cause) { throw new Error("Public desktop uploads require a release commit contained in main.", { cause }); }
  if (env.GITHUB_ACTIONS === "true") {
    assertTrustedReleaseChecks(repoRoot, env, head, version);
    checkRevision(repoRoot, { git, runChecks: () => {}, forceTests: false, recordMarker: false });
  } else {
    checkRevision(repoRoot, { git, runChecks, forceTests });
  }
  return tag;
}

function sha2File(filePath, algorithm) {
  const hash = crypto.createHash(algorithm);
  hash.update(fs.readFileSync(filePath));
  return hash.digest(algorithm === "sha512" ? "base64" : "hex");
}

function assertSafeArtifactName(name) {
  if (typeof name !== "string" || !name || name !== path.basename(name) || name.includes("\0")
    || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Release artifact name is unsafe: ${String(name)}`);
  }
}

function resolveArtifactFile(directory, name) {
  assertSafeArtifactName(name);
  const target = path.resolve(directory, name);
  const root = path.resolve(directory);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Release artifact path escapes the build directory: ${name}`);
  }
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Release artifact must be a regular file: ${name}`);
  }
  return { target, stat };
}

function listRequiredBuildFiles(distDir, platformKey, version) {
  const requirement = platformBuildRequirements[platformKey];
  if (!requirement) throw new Error(`Unknown desktop build platform key: ${platformKey}`);
  const names = fs.readdirSync(distDir).filter((name) => {
    try {
      return fs.lstatSync(path.join(distDir, name)).isFile();
    } catch {
      return false;
    }
  });
  const matched = [];
  for (const suffix of requirement.requiredSuffixes) {
    const found = names.filter((name) => name.endsWith(suffix) && name.includes(version));
    if (found.length !== 1) {
      throw new Error(`Expected exactly one ${suffix} artifact for ${version} in ${distDir}; found ${found.length}.`);
    }
    matched.push(found[0]);
  }
  if (!names.includes(requirement.updateFile)) {
    throw new Error(`Missing update metadata ${requirement.updateFile} in ${distDir}.`);
  }
  matched.push(requirement.updateFile);
  return { requirement, files: matched };
}

function writeBuildManifest(repoRoot, {
  env = process.env,
  git = args => gitAt(repoRoot, args),
  platformKey,
  distDir,
} = {}) {
  if (!env.GITHUB_RUN_ID || !env.GITHUB_RUN_ATTEMPT) {
    throw new Error("Build manifest requires the current GitHub run and attempt.");
  }
  const head = git(["rev-parse", "HEAD"]);
  const version = readVersion(repoRoot);
  const { requirement, files } = listRequiredBuildFiles(distDir, platformKey, version);
  const fileEntries = files.map((name) => {
    const { target, stat } = resolveArtifactFile(distDir, name);
    return {
      name,
      size: stat.size,
      sha256: sha2File(target, "sha256"),
      sha512: sha2File(target, "sha512"),
    };
  });
  const manifest = {
    schema: buildManifestSchema,
    status: "passed",
    head,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    desktopVersion: version,
    os: requirement.os,
    arch: requirement.arch,
    platformKey,
    updateFile: requirement.updateFile,
    files: fileEntries,
    passedAt: new Date().toISOString(),
  };
  const manifestPath = path.join(distDir, "build-manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

function readBuildManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function assertBuildManifest(repoRoot, env, head, version, platformKey, distDir) {
  const manifestPath = path.join(distDir, "build-manifest.json");
  let manifest;
  try { manifest = readBuildManifest(manifestPath); }
  catch { throw new Error(`Trusted build manifest is missing for ${platformKey}; no publication is allowed.`); }
  const requirement = platformBuildRequirements[platformKey];
  if (manifest.schema !== buildManifestSchema
    || manifest.status !== "passed"
    || manifest.head !== head
    || manifest.runId !== env.GITHUB_RUN_ID
    || manifest.runAttempt !== env.GITHUB_RUN_ATTEMPT
    || manifest.desktopVersion !== version
    || manifest.platformKey !== platformKey
    || manifest.os !== requirement.os
    || manifest.arch !== requirement.arch
    || manifest.updateFile !== requirement.updateFile) {
    throw new Error(`Trusted build manifest for ${platformKey} must match this revision, version, workflow run attempt, and platform.`);
  }
  const expectedNames = new Set([
    ...requirement.requiredSuffixes.map((suffix) => {
      const hit = manifest.files.find((file) => file.name.endsWith(suffix));
      if (!hit) throw new Error(`Trusted build manifest for ${platformKey} is missing ${suffix}.`);
      return hit.name;
    }),
    requirement.updateFile,
  ]);
  if (manifest.files.length !== expectedNames.size) {
    throw new Error(`Trusted build manifest for ${platformKey} has unexpected file entries.`);
  }
  for (const file of manifest.files) {
    if (!expectedNames.has(file.name)) {
      throw new Error(`Trusted build manifest for ${platformKey} lists unexpected file ${file.name}.`);
    }
    const { target, stat } = resolveArtifactFile(distDir, file.name);
    if (stat.size !== file.size
      || sha2File(target, "sha256") !== file.sha256
      || sha2File(target, "sha512") !== file.sha512) {
      throw new Error(`Build artifact digest mismatch for ${platformKey}/${file.name}; no publication is allowed.`);
    }
  }
  return manifest;
}

function assertAllBuildManifests(repoRoot, env, head, version, buildsRoot) {
  const manifests = {};
  for (const platformKey of Object.keys(platformBuildRequirements)) {
    manifests[platformKey] = assertBuildManifest(
      repoRoot,
      env,
      head,
      version,
      platformKey,
      path.join(buildsRoot, platformKey),
    );
  }
  return manifests;
}

module.exports = {
  readVersion, assertReleaseTag, runReleaseChecks, checkRevision, verifyUpload,
  assertPgLiveProof, assertTrustedReleaseChecks, writeTrustedReleaseChecks,
  releaseChecks, releaseChecksArtifactPath,
  buildManifestSchema, platformBuildRequirements,
  writeBuildManifest, assertBuildManifest, assertAllBuildManifests,
  resolveArtifactFile, assertSafeArtifactName, sha2File,
};
