const { execFileSync } = require("node:child_process");
const path = require("node:path");
const repoRoot = path.resolve(__dirname, "../../..");

for (const [workspace, script] of [["shared", "build"], ["server", "prisma:generate"], ["server", "build"], ["client", "build:desktop"], ["desktop", "build"]]) {
  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", `@ai-novel/${workspace}`, script], {
    cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32",
    env: { ...process.env, AI_NOVEL_DATABASE_MODE: "sqlite", DATABASE_URL: "file:./dev.db" },
  });
}
