const path = require("node:path");
const { runReleaseChecks, writeTrustedReleaseChecks } = require("./guard.cjs");

const repoRoot = path.resolve(__dirname, "../..");

try {
  runReleaseChecks(repoRoot);
  const { execFileSync } = require("node:child_process");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const version = require(path.join(repoRoot, "desktop/package.json")).version;
  const artifactPath = writeTrustedReleaseChecks(repoRoot, process.env, head, version);
  console.log(`[desktop-release] trusted checks artifact: ${artifactPath}`);
} catch (error) {
  console.error(`[desktop-release] ${error.message}`);
  process.exitCode = 1;
}
