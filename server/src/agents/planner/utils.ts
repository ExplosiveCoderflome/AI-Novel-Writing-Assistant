import type { PlannerInput } from "../types";

export function extractJsonObject(raw: string): string {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last <= first) {
    throw new Error("No JSON object found.");
  }
  return cleaned.slice(first, last + 1);
}

export function slug(value: string): string {
  const normalized = value.trim().replace(/[^\w-]/g, "_");
  return normalized.slice(0, 80) || `k_${Date.now()}`;
}

function sanitizeId(raw: string): string {
  return raw.trim().replace(/[^\w-]/g, "");
}

export function parseChapterNumber(raw: string): number | null {
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }
  if (/^\d+$/.test(normalized)) {
    const value = Number(normalized);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const chars = normalized.replace(/第|章/g, "");
  if (!/^[零一二两三四五六七八九十百]+$/.test(chars)) {
    return null;
  }
  const digitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (chars === "十") {
    return 10;
  }
  if (chars.includes("百")) {
    const [hundredsRaw, tailRaw] = chars.split("百");
    const hundreds = hundredsRaw ? (digitMap[hundredsRaw] ?? 0) : 1;
    const tail = tailRaw ? parseChapterNumber(tailRaw) ?? 0 : 0;
    return hundreds * 100 + tail;
  }
  if (chars.includes("十")) {
    const [tensRaw, onesRaw] = chars.split("十");
    const tens = tensRaw ? (digitMap[tensRaw] ?? 0) : 1;
    const ones = onesRaw ? (digitMap[onesRaw] ?? 0) : 0;
    const value = tens * 10 + ones;
    return value > 0 ? value : null;
  }
  return digitMap[chars] ?? null;
}

export function extractChapterId(goal: string): string | null {
  const patterns = [
    /chapter(?:\s*id)?[:：\s]+([a-zA-Z0-9_-]{6,})/i,
    /章节(?:ID|id)?[:：\s]+([a-zA-Z0-9_-]{6,})/i,
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match?.[1]) {
      return sanitizeId(match[1]);
    }
  }
  return null;
}

export function extractRange(goal: string): { startOrder: number; endOrder: number } | null {
  const patterns = [
    /([零一二两三四五六七八九十百\d]+)\s*[-~到]\s*([零一二两三四五六七八九十百\d]+)/,
    /第\s*([零一二两三四五六七八九十百\d]+)\s*章.*?第\s*([零一二两三四五六七八九十百\d]+)\s*章/,
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (!match?.[1] || !match[2]) {
      continue;
    }
    const first = parseChapterNumber(match[1]);
    const second = parseChapterNumber(match[2]);
    if (typeof first === "number" && typeof second === "number" && first > 0 && second > 0) {
      return {
        startOrder: Math.min(first, second),
        endOrder: Math.max(first, second),
      };
    }
  }
  return null;
}

export function extractExplicitChapterOrders(goal: string): number[] {
  const regex = /第\s*([零一二两三四五六七八九十百\d]+)\s*章/g;
  const found: number[] = [];
  for (const match of goal.matchAll(regex)) {
    const value = parseChapterNumber(match[1]);
    if (value && !found.includes(value)) {
      found.push(value);
    }
  }
  return found;
}

export function extractFirstNChapters(goal: string): number | null {
  const match = goal.match(/前\s*([零一二两三四五六七八九十百\d]+)\s*章|前([零一二两三四五六七八九十百\d]+)章/);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) {
    return null;
  }
  const n = parseChapterNumber(raw);
  return typeof n === "number" && n >= 1 ? n : null;
}

export function extractSingleChapterOrder(goal: string): number | null {
  const patterns = [
    /第\s*([零一二两三四五六七八九十百\d]+)\s*章/,
    /chapter\s*([0-9]+)/i,
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    const value = parseChapterNumber(match[1]);
    if (typeof value === "number" && value >= 1) {
      return value;
    }
  }
  return null;
}

export function extractContent(goal: string): string | null {
  const match = goal.match(/(?:内容|正文|替换为)[:：]\s*([\s\S]+)$/);
  if (!match?.[1]) {
    return null;
  }
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

export function buildIdempotencyKey(prefix: string, input: PlannerInput): string {
  return slug(`${prefix}_${input.novelId ?? "global"}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
}

export function normalizeOrders(values: number[] | undefined): number[] {
  return [...new Set((values ?? []).filter((item) => Number.isFinite(item) && item >= 1))].sort((a, b) => a - b);
}
