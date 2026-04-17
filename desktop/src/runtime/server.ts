import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import path from "node:path";
import { resolveDesktopAppDataDir, resolveWorkspaceRoot } from "./paths";

type DesktopServerMode = "external" | "managed";

export interface DesktopServerHandle {
  mode: DesktopServerMode;
  port: number;
  stop: () => Promise<void>;
}

function resolveServerPort(): number {
  const parsed = Number(process.env.AI_NOVEL_SERVER_PORT ?? process.env.PORT ?? 3000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3000;
}

function resolveServerMode(isPackaged: boolean): DesktopServerMode {
  const rawMode = process.env.AI_NOVEL_DESKTOP_SERVER_MODE?.trim().toLowerCase();
  if (rawMode === "external" || rawMode === "managed") {
    return rawMode;
  }
  return isPackaged ? "managed" : "external";
}

async function waitForServerHealth(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for server health at ${healthUrl}.`);
}

function toPnpmCommand(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function buildManagedServerCommand(): {
  command: string;
  args: string[];
  cwd: string;
} {
  const explicitEntry = process.env.AI_NOVEL_SERVER_ENTRY?.trim();
  if (explicitEntry) {
    return {
      command: process.execPath,
      args: [path.resolve(explicitEntry)],
      cwd: resolveWorkspaceRoot(),
    };
  }

  return {
    command: toPnpmCommand(),
    args: ["--filter", "@ai-novel/server", "start"],
    cwd: resolveWorkspaceRoot(),
  };
}

function stopChildProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    child.once("exit", () => resolve());
    child.kill();
  });
}

async function startManagedServer(port: number): Promise<DesktopServerHandle> {
  const appDataDir = resolveDesktopAppDataDir();
  const { command, args, cwd } = buildManagedServerCommand();
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      AI_NOVEL_RUNTIME: "desktop",
      AI_NOVEL_APP_DATA_DIR: appDataDir,
      PORT: String(port),
      HOST: "127.0.0.1",
      ALLOW_LAN: "false",
    },
    stdio: "inherit",
  });

  try {
    await waitForServerHealth(port, 45_000);
  } catch (error) {
    await stopChildProcess(child);
    throw error;
  }

  return {
    mode: "managed",
    port,
    stop: async () => stopChildProcess(child),
  };
}

export async function startDesktopServer(options: { isPackaged: boolean }): Promise<DesktopServerHandle> {
  const port = resolveServerPort();
  const mode = resolveServerMode(options.isPackaged);

  if (mode === "external") {
    await waitForServerHealth(port, 45_000);
    return {
      mode,
      port,
      stop: async () => undefined,
    };
  }

  return startManagedServer(port);
}
