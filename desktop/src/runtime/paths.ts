import os from "node:os";
import path from "node:path";

const APP_NAME = "AI-Novel-Writing-Assistant-v2";

export interface DesktopRuntimeConfig {
  mode: "desktop";
  apiBaseUrl: string;
  apiTimeoutMs: number;
}

export function resolveDesktopAppDataDir(): string {
  const configuredDir = process.env.AI_NOVEL_APP_DATA_DIR?.trim();
  if (configuredDir) {
    return path.resolve(configuredDir);
  }

  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return path.join(localAppData, APP_NAME);
  }

  const appData = process.env.APPDATA?.trim();
  if (appData) {
    return path.join(appData, APP_NAME);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
  }

  return path.join(os.homedir(), `.${APP_NAME}`);
}

export function resolveDesktopRuntimeConfig(port: number): DesktopRuntimeConfig {
  return {
    mode: "desktop",
    apiBaseUrl: `http://127.0.0.1:${port}/api`,
    apiTimeoutMs: 10 * 60 * 1000,
  };
}

export function resolveRendererDevUrl(): string {
  return process.env.AI_NOVEL_DESKTOP_RENDERER_URL?.trim() || "http://127.0.0.1:5173";
}

export function resolveRendererIndexHtml(): string {
  return path.resolve(__dirname, "../../../client/dist/index.html");
}

export function resolveWorkspaceRoot(): string {
  return path.resolve(__dirname, "../../..");
}
