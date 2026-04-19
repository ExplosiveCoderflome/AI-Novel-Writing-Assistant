import { spawnSync } from "node:child_process";

const result = spawnSync("vite", ["build"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    AI_NOVEL_CLIENT_BASE: "relative",
  },
});

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}
