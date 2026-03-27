// 开发且未显式配置时：用当前页面的 hostname + 端口 3000，便于局域网访问
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV && typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : "http://localhost:3000/api");

const DEFAULT_API_TIMEOUT_MS = 10 * 60 * 1000;

function parseApiTimeoutMs(rawValue: string | undefined): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return DEFAULT_API_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

export const API_TIMEOUT_MS = parseApiTimeoutMs(import.meta.env.VITE_API_TIMEOUT_MS);
