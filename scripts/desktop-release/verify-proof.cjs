const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { assertPgLiveProof, assertTrustedReleaseChecks } = require("./guard.cjs");

const repoRoot = path.resolve(__dirname, "../..");
try {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const version = require(path.join(repoRoot, "desktop/package.json")).version;
  assertPgLiveProof(repoRoot, process.env, head);
  assertTrustedReleaseChecks(repoRoot, process.env, head, version);
  console.log(`[desktop-release] PG proof and trusted checks verified for ${head}.`);
} catch (error) {
  console.error(`[desktop-release] ${error.message}`);
  process.exitCode = 1;
}
