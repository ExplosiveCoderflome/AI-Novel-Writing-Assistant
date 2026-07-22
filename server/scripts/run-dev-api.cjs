const { spawn } = require("node:child_process");

process.env.DISABLE_INLINE_WORKER = "true";

const child = spawn("ts-node-dev", ["--respawn", "--transpile-only", "src/app.ts"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
