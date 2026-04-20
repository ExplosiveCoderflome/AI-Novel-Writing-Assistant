const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
type AppRuntimeMode = "web" | "desktop";

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

const runtimeConfig = resolveRuntimeConfig();

export const APP_RUNTIME: AppRuntimeMode = runtimeConfig.mode === "desktop" ? "desktop" : "web";
export const APP_RUNTIME_IS_PACKAGED = runtimeConfig.isPackaged === true;
export const APP_VERSION = runtimeConfig.appVersion?.trim() || "0.0.0";
export const APP_RUNTIME_IS_PORTABLE = runtimeConfig.isPortable === true;
export const APP_UPDATE_CHANNEL = runtimeConfig.updateChannel?.trim() || "beta";

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = runtimeConfig.apiBaseUrl?.trim() || import.meta.env.VITE_API_BASE_URL?.trim();
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return configuredBaseUrl || "http://localhost:3000/api";
  }

  if (APP_RUNTIME === "web" && !configuredBaseUrl) {
    return "/api";
  }

  const inferredBaseUrl = `${window.location.protocol}//${window.location.hostname}:3000/api`;
  if (!configuredBaseUrl) {
    return inferredBaseUrl;
  }

  try {
    const parsed = new URL(configuredBaseUrl, window.location.origin);
    if (!isLoopbackHost(parsed.hostname) || isLoopbackHost(window.location.hostname)) {
      return trimTrailingSlash(parsed.toString());
    }
    parsed.hostname = window.location.hostname;
    if (!parsed.port) {
      parsed.port = "3000";
    }
    return trimTrailingSlash(parsed.toString());
  } catch {
    return configuredBaseUrl;
  }
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

export const API_TIMEOUT_MS = parseApiTimeoutMs(runtimeConfig.apiTimeoutMs ?? import.meta.env.VITE_API_TIMEOUT_MS);
