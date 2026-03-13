import type { PlannerInput } from "../types";

const INTENT_ALIAS_MAP: Record<string, string> = {
  complete_novel: "produce_novel",
  finish_novel: "produce_novel",
  continue_novel: "produce_novel",
  continue_production: "produce_novel",
  novel_production_status: "query_novel_production_status",
  production_status: "query_novel_production_status",
  list_tasks: "query_task_status",
  task_status: "query_task_status",
  task_overview: "query_task_status",
  system_task_status: "query_task_status",
  list_characters: "inspect_characters",
  query_character_count: "inspect_characters",
  character_count: "inspect_characters",
  count_characters: "inspect_characters",
  novel_character_count: "inspect_characters",
  current_novel_character_count: "inspect_characters",
  query_novel_character_count: "inspect_characters",
  query_characters: "inspect_characters",
  character_status: "inspect_characters",
  character_overview: "inspect_characters",
};

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

function cleanupNovelTitle(raw: string): string | null {
  const normalized = raw
    .trim()
    .replace(/^[《“"'`]+/, "")
    .replace(/[》”"'`]+$/, "")
    .replace(/^(小说|书名|标题)[:：\s]*/u, "")
    .replace(/[。！？!?,，；;]+$/u, "")
    .trim();
  return normalized.length > 0 ? normalized.slice(0, 80) : null;
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

export function extractNovelTitle(goal: string): string | null {
  const quotedPatterns = [
    /《([^》\n]{1,80})》/u,
    /“([^”\n]{1,80})”/u,
    /"([^"\n]{1,80})"/u,
  ];
  for (const pattern of quotedPatterns) {
    const match = goal.match(pattern);
    const candidate = cleanupNovelTitle(match?.[1] ?? "");
    if (candidate) {
      return candidate;
    }
  }

  const patterns = [
    /(?:创建|新建|建立)(?:一?本)?(?:小说|书)(?:作品)?(?:叫|名为|标题为)?[:：\s]*([^\n]+)$/u,
    /(?:把|将)\s*(.+?)\s*(?:设为|切换到|绑定为|作为).*(?:当前工作区|当前小说|工作区)/u,
    /(?:选择|切换到|打开|进入)(?:小说|工作区)?[:：\s]*([^\n]+)$/u,
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    const candidate = cleanupNovelTitle(match?.[1] ?? "");
    if (candidate && !/^(当前工作区|当前小说|工作区)$/u.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function buildIdempotencyKey(prefix: string, input: PlannerInput): string {
  return slug(`${prefix}_${input.novelId ?? "global"}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
}

export function normalizeOrders(values: number[] | undefined): number[] {
  return [...new Set((values ?? []).filter((item) => Number.isFinite(item) && item >= 1))].sort((a, b) => a - b);
}

export function normalizeIntentPayload(raw: unknown, input: PlannerInput): Record<string, unknown> {
  const payload = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const chapterSelectorsRaw = payload.chapterSelectors;
  const chapterSelectors = chapterSelectorsRaw && typeof chapterSelectorsRaw === "object" && !Array.isArray(chapterSelectorsRaw)
    ? chapterSelectorsRaw as Record<string, unknown>
    : {};

  const normalized: Record<string, unknown> = {
    ...payload,
    goal: typeof payload.goal === "string" && payload.goal.trim() ? payload.goal.trim() : input.goal,
    chapterSelectors,
  };

  if (typeof payload.intent === "string" && payload.intent.trim()) {
    const rawIntent = payload.intent.trim();
    normalized.intent = INTENT_ALIAS_MAP[rawIntent] ?? rawIntent;
  }

  if (payload.novelTitle == null || (typeof payload.novelTitle === "string" && !payload.novelTitle.trim())) {
    delete normalized.novelTitle;
  }
  if (payload.worldName == null || (typeof payload.worldName === "string" && !payload.worldName.trim())) {
    delete normalized.worldName;
  }
  if (payload.description == null || (typeof payload.description === "string" && !payload.description.trim())) {
    delete normalized.description;
  }
  if (payload.genre == null || (typeof payload.genre === "string" && !payload.genre.trim())) {
    delete normalized.genre;
  }
  if (payload.worldType == null || (typeof payload.worldType === "string" && !payload.worldType.trim())) {
    delete normalized.worldType;
  }
  if (payload.styleTone == null || (typeof payload.styleTone === "string" && !payload.styleTone.trim())) {
    delete normalized.styleTone;
  }
  if (typeof payload.pacePreference === "string" && payload.pacePreference.trim()) {
    const paceValue = payload.pacePreference.trim();
    normalized.pacePreference = paceValue === "快节奏" ? "fast" : paceValue === "慢节奏" ? "slow" : paceValue === "均衡" ? "balanced" : paceValue;
  } else {
    delete normalized.pacePreference;
  }
  if (typeof payload.narrativePov === "string" && payload.narrativePov.trim()) {
    const povValue = payload.narrativePov.trim();
    normalized.narrativePov = povValue === "第一人称"
      ? "first_person"
      : povValue === "第三人称"
        ? "third_person"
        : povValue === "混合"
          ? "mixed"
          : povValue;
  } else {
    delete normalized.narrativePov;
  }
  if (payload.content == null || (typeof payload.content === "string" && !payload.content.trim())) {
    delete normalized.content;
  }
  if (payload.note == null || (typeof payload.note === "string" && !payload.note.trim())) {
    delete normalized.note;
  }
  if (payload.requiresNovelContext == null) {
    delete normalized.requiresNovelContext;
  }
  if (payload.confidence == null) {
    delete normalized.confidence;
  }
  const rawTargetChapterCount = payload.targetChapterCount;
  if (typeof rawTargetChapterCount === "string" && /^\d+$/.test(rawTargetChapterCount.trim())) {
    normalized.targetChapterCount = Number(rawTargetChapterCount.trim());
  } else if (typeof rawTargetChapterCount === "number" && Number.isFinite(rawTargetChapterCount)) {
    normalized.targetChapterCount = Math.max(1, Math.floor(rawTargetChapterCount));
  } else if (normalized.intent === "produce_novel") {
    normalized.targetChapterCount = 20;
  } else {
    delete normalized.targetChapterCount;
  }

  return normalized;
}
