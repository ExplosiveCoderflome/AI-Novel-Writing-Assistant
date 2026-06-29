import { useEffect, useState } from "react";

const CACHE_KEY_PREFIX = "ai-novel-site:github-stars";
const TTL_MS = 30 * 60 * 1000;

type CacheEntry = { count: number; fetchedAt: number };

function cacheKey(owner: string, repo: string) {
  return `${CACHE_KEY_PREFIX}:${owner}/${repo}`;
}

function readCache(key: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (typeof parsed.count !== "number" || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: CacheEntry) {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
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
    fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || typeof data.stargazers_count !== "number") return;
        setCount(data.stargazers_count);
        writeCache(key, { count: data.stargazers_count, fetchedAt: Date.now() });
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
