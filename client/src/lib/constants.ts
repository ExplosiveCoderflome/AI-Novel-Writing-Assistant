const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
type AppRuntimeMode = "web" | "desktop";
type ViteRuntimeEnv = Partial<ImportMetaEnv> & {
  DEV?: boolean;
  VITE_API_BASE_URL?: string;
  VITE_API_TIMEOUT_MS?: string;
};
type BrowserLocation = Pick<Location, "protocol" | "hostname" | "origin">;

interface ClientRuntimeConfig {
  mode?: AppRuntimeMode;
  apiBaseUrl?: string;
  apiTimeoutMs?: number | string;
  isPackaged?: boolean;
  appVersion?: string;
  isPortable?: boolean;
  updateChannel?: string;
}

function isLoopbackHost(hostname: string | null | undefined): boolean {
  return Boolean(hostname) && LOOPBACK_HOSTS.has(String(hostname).toLowerCase());
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveRuntimeConfig(): ClientRuntimeConfig {
  if (typeof window === "undefined") {
    return {};
  }

  return window.__AI_NOVEL_RUNTIME__ ?? {};
}

function resolveViteEnv(): ViteRuntimeEnv {
  return (import.meta as ImportMeta & { env?: ViteRuntimeEnv }).env ?? {};
}

function resolveAppRuntime(config: ClientRuntimeConfig): AppRuntimeMode {
  return config.mode === "desktop" ? "desktop" : "web";
}

const runtimeConfig = resolveRuntimeConfig();
const viteEnv = resolveViteEnv();

export const APP_RUNTIME: AppRuntimeMode = resolveAppRuntime(runtimeConfig);
export const APP_RUNTIME_IS_PACKAGED = runtimeConfig.isPackaged === true;
export const APP_VERSION = runtimeConfig.appVersion?.trim() || "0.0.0";
export const APP_RUNTIME_IS_PORTABLE = runtimeConfig.isPortable === true;
export const APP_UPDATE_CHANNEL = runtimeConfig.updateChannel?.trim() || "beta";

interface ResolveApiBaseUrlInput {
  runtimeConfig?: ClientRuntimeConfig;
  viteEnv?: ViteRuntimeEnv;
  windowLocation?: BrowserLocation | null;
}

export function resolveApiBaseUrlForEnvironment({
  runtimeConfig: config = {},
  viteEnv: env = {},
  windowLocation = null,
}: ResolveApiBaseUrlInput): string {
  const configuredBaseUrl = config.apiBaseUrl?.trim() || env.VITE_API_BASE_URL?.trim();
  const appRuntime = resolveAppRuntime(config);
  if (!windowLocation) {
    return configuredBaseUrl || "http://localhost:3000/api";
  }

  if (!env.DEV) {
    if (configuredBaseUrl) {
      return configuredBaseUrl;
    }
    return appRuntime === "desktop" ? "http://localhost:3000/api" : "/api";
  }

  if (appRuntime === "web" && !configuredBaseUrl) {
    return "/api";
  }

  const inferredBaseUrl = `${windowLocation.protocol}//${windowLocation.hostname}:3000/api`;
  if (!configuredBaseUrl) {
    return inferredBaseUrl;
  }

  try {
    const parsed = new URL(configuredBaseUrl, windowLocation.origin);
    if (!isLoopbackHost(parsed.hostname) || isLoopbackHost(windowLocation.hostname)) {
      return trimTrailingSlash(parsed.toString());
    }
    parsed.hostname = windowLocation.hostname;
    if (!parsed.port) {
      parsed.port = "3000";
    }
    return trimTrailingSlash(parsed.toString());
  } catch {
    return configuredBaseUrl;
  }
}

function resolveApiBaseUrl(): string {
  return resolveApiBaseUrlForEnvironment({
    runtimeConfig,
    viteEnv,
    windowLocation: typeof window === "undefined" ? null : window.location,
  });
}

// 开发环境优先把 API 指向当前页面所在主机，避免局域网访问时仍被锁到 localhost。
export const API_BASE_URL = resolveApiBaseUrl();

const DEFAULT_API_TIMEOUT_MS = 10 * 60 * 1000;

function parseApiTimeoutMs(rawValue: string | number | undefined): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_API_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

export const API_TIMEOUT_MS = parseApiTimeoutMs(runtimeConfig.apiTimeoutMs ?? viteEnv.VITE_API_TIMEOUT_MS);
