import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";

export interface ExtractedFact {
  category: "plot" | "character" | "world";
  content: string;
}

export function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(content ?? "");
}

export function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

export function extractJSONValue(source: string): string {
  const text = cleanJsonText(source);
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const start = objectStart < 0
    ? arrayStart
    : arrayStart < 0
      ? objectStart
      : Math.min(objectStart, arrayStart);

  if (start < 0) {
    throw new Error("未检测到有效 JSON 值。");
  }

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === opener) {
      depth += 1;
      continue;
    }
    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  throw new Error("未检测到完整 JSON 值。");
}

export function extractJSONObject(source: string): string {
  const extracted = extractJSONValue(source);
  if (!extracted.startsWith("{")) {
    throw new Error("未检测到有效 JSON 对象。");
  }
  return extracted;
}

export function parseJSONObject<T>(source: string): T {
  return JSON.parse(extractJSONObject(source)) as T;
}

export function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function clamp(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizeScore(value: Partial<QualityScore>): QualityScore {
  const coherence = clamp(value.coherence ?? 0);
  const repetition = clamp(value.repetition ?? 100);
  const pacing = clamp(value.pacing ?? 0);
  const voice = clamp(value.voice ?? 0);
  const engagement = clamp(value.engagement ?? 0);
  const overall = clamp(value.overall ?? (coherence + (100 - repetition) + pacing + voice + engagement) / 5);
  return { coherence, repetition, pacing, voice, engagement, overall };
}

export function ruleScore(content: string): QualityScore {
  const text = content.trim();
  const sentences = text.split(/[。！？!?]/).map((item) => item.trim()).filter(Boolean);
  const unique = new Set(sentences);
  const repeatRatio = sentences.length > 0 ? 1 - unique.size / sentences.length : 0;
  const coherence = text.length >= 1800 ? 85 : text.length >= 1200 ? 75 : 60;
  const repetition = clamp(repeatRatio * 100);
  const pacing = text.length >= 1800 && text.length <= 3600 ? 82 : 70;
  const voice = sentences.length >= 25 ? 80 : 68;
  const engagement = /悬念|危机|冲突|转折/.test(text) ? 85 : 72;
  const overall = clamp((coherence + (100 - repetition) + pacing + voice + engagement) / 5);
  return { coherence, repetition, pacing, voice, engagement, overall };
}

export function parseLegacyReviewOutput(text: string): { score: QualityScore; issues: ReviewIssue[] } {
  try {
    const parsed = parseJSONObject<{
      score?: Partial<QualityScore>;
      scores?: Partial<QualityScore>;
      issues?: ReviewIssue[];
    }>(text);
    return {
      score: normalizeScore(parsed.score ?? parsed.scores ?? {}),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    return { score: ruleScore(text), issues: [] };
  }
}

export function extractFacts(content: string): ExtractedFact[] {
  const lines = content
    .split(/[\n。！？!?]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8)
    .slice(0, 12);
  return lines.map((line) => {
    if (/世界|地理|宗门|王朝|大陆|规则|城邦|门派/.test(line)) {
      return { category: "world" as const, content: line };
    }
    if (/主角|反派|角色|她|他|他们|众人|少女|少年/.test(line)) {
      return { category: "character" as const, content: line };
    }
    return { category: "plot" as const, content: line };
  });
}

export function briefSummary(content: string, facts?: ExtractedFact[]): string {
  const text = content.trim();
  if (!text) {
    return "";
  }
  const extractedFacts = (facts ?? extractFacts(content))
    .map((item) => ({ ...item, content: item.content.trim() }))
    .filter((item) => item.content.length > 0);
  const unique = (items: string[], maxItems = 3) => {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item)) {
        continue;
      }
      seen.add(item);
      result.push(item);
      if (result.length >= maxItems) {
        break;
      }
    }
    return result;
  };
  const plotEvents = unique(extractedFacts.filter((item) => item.category === "plot").map((item) => item.content), 2);
  const characterStates = unique(extractedFacts.filter((item) => item.category === "character").map((item) => item.content), 2);
  const worldFacts = unique(extractedFacts.filter((item) => item.category === "world").map((item) => item.content), 1);
  const blocks: string[] = [];
  if (plotEvents.length > 0) {
    blocks.push(`Plot: ${plotEvents.join("；")}`);
  }
  if (characterStates.length > 0) {
    blocks.push(`Character: ${characterStates.join("；")}`);
  }
  if (worldFacts.length > 0) {
    blocks.push(`World: ${worldFacts.join("；")}`);
  }
  if (blocks.length > 0) {
    return blocks.join("\n");
  }
  return text.length <= 220 ? text : `${text.slice(0, 220)}...`;
}

export function normalizeSeverity(value: unknown): "low" | "medium" | "high" | "critical" {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

export function normalizeAuditType(value: unknown): "continuity" | "character" | "plot" | "mode_fit" {
  if (value === "continuity" || value === "character" || value === "plot" || value === "mode_fit") {
    return value;
  }
  return "plot";
}

export function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => String(item ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function stringifyStringArray(value: string[] | null | undefined): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  return JSON.stringify(value.map((item) => item.trim()).filter(Boolean));
}
