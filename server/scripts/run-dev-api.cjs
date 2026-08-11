const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

process.env.DISABLE_INLINE_WORKER = "true";

const serverDir = path.resolve(__dirname, "..");
const appJsPath = path.join(serverDir, "dist", "app.js");

// 确保在启动 API 服务前，dist/app.js 已构建完成
if (!fs.existsSync(appJsPath)) {
  console.log("[run-dev-api] Building server TypeScript files...");
  try {
    execSync("npx tsc -p tsconfig.json", { cwd: serverDir, stdio: "inherit" });
  } catch (e) {
    console.warn("[run-dev-api] Build warning:", e.message);
  }
}

// 优先使用快速稳定的 node dist/app.js，支持跨平台无阻塞启动
const child = spawn("node", ["dist/app.js"], {
  cwd: serverDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
