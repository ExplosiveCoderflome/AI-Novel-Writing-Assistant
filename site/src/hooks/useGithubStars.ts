import { useEffect, useState } from "react";

const CACHE_KEY_PREFIX = "ai-novel-site:github-stars";
const TTL_MS = 30 * 60 * 1000;

type CacheEntry = { count: number; fetchedAt: number };

function cacheKey(owner: string, repo: string) {
  return `${CACHE_KEY_PREFIX}:${owner}/${repo}`;
}

function readCache(key: string): CacheEntry | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (typeof parsed.count !== "number" || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: CacheEntry) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage may be unavailable in private mode — silently ignore
  }
}

export function useGithubStars(owner: string, repo: string): number | null {
  const key = cacheKey(owner, repo);
  const [count, setCount] = useState<number | null>(() => readCache(key)?.count ?? null);

  useEffect(() => {
    const cached = readCache(key);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      setCount(cached.count);
      return;
    }

    const controller = new AbortController();
    // ungh.cc is a CDN-cached, CORS-enabled GitHub proxy by unjs.
    // Direct api.github.com is rate-limited to 60 requests/hour per IP,
    // which gets exhausted quickly behind shared / NAT / VPN egress IPs.
    fetch(`https://ungh.cc/repos/${owner}/${repo}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const stars = data?.repo?.stars;
        if (typeof stars !== "number") return;
        setCount(stars);
        writeCache(key, { count: stars, fetchedAt: Date.now() });
      })
      .catch(() => {
        // ignore network / rate-limit errors; fall back to cached or hide
      });

    return () => controller.abort();
  }, [key, owner, repo]);

  return count;
}

export function formatStarCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.round(count / 1000)}k`;
}
