const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

try {
  execFileSync(process.execPath, [
    path.join("desktop", "scripts", "run-electron-builder.cjs"),
    "--win",
    "nsis",
    "--x64",
    "--publish",
    "always",
  ], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      AI_NOVEL_RELEASE_CHANNEL: "beta",
    },
  });
} catch (error) {
  console.error("[publish:desktop:beta] failed.", error);
  process.exit(1);
}
