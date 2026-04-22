import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import type { UtilityProcess } from "electron";
import { utilityProcess } from "electron";
import { appendDesktopLog, logDesktopError } from "./logging";
import {
  resolveDesktopAppDataDir,
  resolveDesktopResourcesDir,
  resolvePackagedServerEntry,
  resolveWorkspaceRoot,
} from "./paths";

type DesktopServerMode = "external" | "managed";

export interface DesktopServerHandle {
  mode: DesktopServerMode;
  port: number;
  stop: () => Promise<void>;
}

interface ManagedDesktopProcess {
  hasExited: () => boolean;
  stop: () => Promise<void>;
}

function resolveServerMode(isPackaged: boolean): DesktopServerMode {
  const rawMode = process.env.AI_NOVEL_DESKTOP_SERVER_MODE?.trim().toLowerCase();
  if (rawMode === "external" || rawMode === "managed") {
    return rawMode;
  }
  return isPackaged ? "managed" : "external";
}

function resolveConfiguredPort(): number | undefined {
  const parsed = Number(process.env.AI_NOVEL_SERVER_PORT ?? process.env.PORT ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function resolveExternalServerPort(): number {
  return resolveConfiguredPort() ?? 3000;
}

async function resolveManagedServerPort(): Promise<number> {
  const configuredPort = resolveConfiguredPort();
  if (configuredPort) {
    return configuredPort;
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof port !== "number" || port <= 0) {
          reject(new Error("Failed to allocate a free loopback port for the desktop server."));
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function resolveDesktopServerPort(options: { isPackaged: boolean }): Promise<number> {
  const mode = resolveServerMode(options.isPackaged);
  return mode === "external" ? resolveExternalServerPort() : resolveManagedServerPort();
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

async function waitForServerHealthOrExit(
  port: number,
  processHandle: ManagedDesktopProcess,
  timeoutMs = 45_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `http://127.0.0.1:${port}/api/health`;

  while (Date.now() < deadline) {
    if (processHandle.hasExited()) {
      throw new Error(`Desktop server exited before becoming healthy at ${healthUrl}.`);
    }

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

function stopUtilityChildProcess(child: UtilityProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.pid == null) {
      resolve();
      return;
    }

    child.once("exit", () => resolve());
    child.kill();
  });
}

function appendProcessOutput(
  stream: NodeJS.ReadableStream | null,
  source: string,
  level: "info" | "error",
): void {
  if (!stream) {
    return;
  }

  stream.on("data", (chunk) => {
    const message = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    const lines = message
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    for (const line of lines) {
      appendDesktopLog(source, line, level);
    }
  });
}

function startWorkspaceManagedServer(port: number): ManagedDesktopProcess {
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
    stdio: "pipe",
  });

  appendProcessOutput(child.stdout, "desktop.server.stdout", "info");
  appendProcessOutput(child.stderr, "desktop.server.stderr", "error");
  child.on("error", (error) => {
    logDesktopError("desktop.server.process", error);
  });
  child.on("exit", (code, signal) => {
    appendDesktopLog(
      "desktop.server.process",
      `Workspace-managed desktop server exited with code=${code ?? "null"} signal=${signal ?? "none"}.`,
      code === 0 ? "info" : "warn",
    );
  });

  return {
    hasExited: () => child.exitCode !== null || child.killed,
    stop: async () => stopChildProcess(child),
  };
}

function startPackagedManagedServer(port: number): ManagedDesktopProcess {
  const child = utilityProcess.fork(resolvePackagedServerEntry(), [], {
    cwd: resolveDesktopResourcesDir(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      AI_NOVEL_RUNTIME: "desktop",
      AI_NOVEL_APP_DATA_DIR: resolveDesktopAppDataDir(),
      PORT: String(port),
      HOST: "127.0.0.1",
      ALLOW_LAN: "false",
      RAG_ENABLED: process.env.RAG_ENABLED?.trim() || "false",
    },
    stdio: "pipe",
    serviceName: "AI Novel Local Server",
  });

  let hasExited = false;
  child.on("spawn", () => {
    appendDesktopLog("desktop.server.process", `Packaged desktop server spawned with pid=${child.pid ?? "unknown"}.`);
  });
  child.on("error", (error) => {
    logDesktopError("desktop.server.process", error);
  });
  child.on("exit", (code) => {
    hasExited = true;
    appendDesktopLog(
      "desktop.server.process",
      `Packaged desktop server exited with code=${code}.`,
      code === 0 ? "info" : "warn",
    );
  });
  appendProcessOutput(child.stdout, "desktop.server.stdout", "info");
  appendProcessOutput(child.stderr, "desktop.server.stderr", "error");

  return {
    hasExited: () => hasExited,
    stop: async () => stopUtilityChildProcess(child),
  };
}

async function startManagedServer(port: number, isPackaged: boolean): Promise<DesktopServerHandle> {
  const managedProcess = isPackaged
    ? startPackagedManagedServer(port)
    : startWorkspaceManagedServer(port);

  try {
    await waitForServerHealthOrExit(port, managedProcess, 45_000);
    appendDesktopLog("desktop.server.process", `Desktop server is healthy at http://127.0.0.1:${port}/api/health.`);
  } catch (error) {
    await managedProcess.stop();
    throw error;
  }

  return {
    mode: "managed",
    port,
    stop: async () => managedProcess.stop(),
  };
}

export async function startDesktopServer(options: { isPackaged: boolean; port?: number }): Promise<DesktopServerHandle> {
  const mode = resolveServerMode(options.isPackaged);

  if (mode === "external") {
    const port = options.port ?? resolveExternalServerPort();
    await waitForServerHealth(port, 45_000);
    return {
      mode,
      port,
      stop: async () => undefined,
    };
  }

  const port = options.port ?? await resolveManagedServerPort();
  return startManagedServer(port, options.isPackaged);
}
