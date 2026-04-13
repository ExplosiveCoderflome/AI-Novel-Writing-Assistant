import type { PlannerInput } from "../types";
import { listPlannerSemanticDefinitions } from "../toolRegistry";

const INTENT_ALIAS_MAP: Record<string, string> = {
  complete_novel: "produce_novel",
  finish_novel: "produce_novel",
  continue_novel: "produce_novel",
  continue_production: "produce_novel",
  generate_world_for_novel: "produce_novel",
  generate_novel_characters: "produce_novel",
  generate_story_bible: "produce_novel",
  generate_novel_outline: "produce_novel",
  generate_structured_outline: "produce_novel",
  sync_chapters_from_structured_outline: "produce_novel",
  start_full_novel_pipeline: "start_pipeline",
  queue_pipeline_run: "start_pipeline",
  preview_pipeline_run: "start_pipeline",
  base_character_list: "list_base_characters",
  list_base_character_library: "list_base_characters",
  list_base_characters: "list_base_characters",
  base_characters: "list_base_characters",
  query_base_characters: "list_base_characters",
  character_library: "list_base_characters",
  novel_production_status: "query_novel_production_status",
  production_status: "query_novel_production_status",
  knowledge_search: "search_knowledge",
  reference_search: "search_knowledge",
  reference_lookup: "search_knowledge",
  setting_reference: "search_knowledge",
  search_setting_reference: "search_knowledge",
  similar_setting_search: "search_knowledge",
  find_similar_setting: "search_knowledge",
  world_reference_search: "search_knowledge",
  unbind_world: "unbind_world_from_novel",
  remove_world_binding: "unbind_world_from_novel",
  clear_world_binding: "unbind_world_from_novel",
  detach_world_from_novel: "unbind_world_from_novel",
  cancel_world_binding: "unbind_world_from_novel",
  brainstorm_novel_setup: "ideate_novel_setup",
  novel_setup_brainstorm: "ideate_novel_setup",
  setup_options: "ideate_novel_setup",
  generate_setup_options: "ideate_novel_setup",
  brainstorm_setup_options: "ideate_novel_setup",
  premise_options: "ideate_novel_setup",
  core_setting_options: "ideate_novel_setup",
  story_promise_options: "ideate_novel_setup",
  direction_options: "ideate_novel_setup",
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

function normalizeIntentAliasKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildSemanticIntentAliasMap(): Record<string, string> {
  const semanticMap: Record<string, string> = {};
  for (const item of listPlannerSemanticDefinitions()) {
    semanticMap[normalizeIntentAliasKey(item.intent)] = item.intent;
    semanticMap[normalizeIntentAliasKey(item.toolName)] = item.intent;
    for (const alias of item.aliases) {
      semanticMap[normalizeIntentAliasKey(alias)] = item.intent;
    }
  }
  return semanticMap;
}

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

function looksLikeCurrentNovelOverviewQuery(goal: string, input: PlannerInput): boolean {
  if (input.contextMode !== "novel" || !input.novelId) {
    return false;
  }
  const normalized = goal.replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }

  return /(?:查看|看下|看一下|看看|检查一下|检查下|瞧瞧|瞅瞅).*(?:这本小说|当前小说|这本书|这部小说|这书)/u.test(normalized)
    || /(?:这本小说|当前小说|这本书|这部小说).*(?:怎么样|什么情况|啥情况|状态|进度)/u.test(normalized)
    || /(?:小说|这本书|当前小说).*(?:总览|概况|整体情况)/u.test(normalized);
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
    const semanticAliases = buildSemanticIntentAliasMap();
    normalized.intent = semanticAliases[normalizeIntentAliasKey(rawIntent)]
      ?? INTENT_ALIAS_MAP[rawIntent]
      ?? rawIntent;
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
  if (typeof payload.projectMode === "string" && payload.projectMode.trim()) {
    const projectModeValue = payload.projectMode.trim();
    normalized.projectMode = projectModeValue === "AI 主导"
      ? "ai_led"
      : projectModeValue === "人机协作"
        ? "co_pilot"
        : projectModeValue === "草稿优先"
          ? "draft_mode"
          : projectModeValue === "自动流水线"
            ? "auto_pipeline"
            : projectModeValue;
  } else {
    delete normalized.projectMode;
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
  if (typeof payload.emotionIntensity === "string" && payload.emotionIntensity.trim()) {
    const emotionValue = payload.emotionIntensity.trim();
    normalized.emotionIntensity = emotionValue === "低" || emotionValue === "低情绪强度"
      ? "low"
      : emotionValue === "中" || emotionValue === "中等情绪强度"
        ? "medium"
        : emotionValue === "高" || emotionValue === "高情绪强度"
          ? "high"
          : emotionValue;
  } else {
    delete normalized.emotionIntensity;
  }
  if (typeof payload.aiFreedom === "string" && payload.aiFreedom.trim()) {
    const freedomValue = payload.aiFreedom.trim();
    normalized.aiFreedom = freedomValue === "低" || freedomValue === "低 AI 自由度"
      ? "low"
      : freedomValue === "中" || freedomValue === "中 AI 自由度" || freedomValue === "中等 AI 自由度"
        ? "medium"
        : freedomValue === "高" || freedomValue === "高 AI 自由度"
          ? "high"
          : freedomValue;
  } else {
    delete normalized.aiFreedom;
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
  if (typeof payload.interactionMode === "string" && payload.interactionMode.trim()) {
    normalized.interactionMode = payload.interactionMode.trim();
  } else {
    delete normalized.interactionMode;
  }
  if (typeof payload.assistantResponse === "string" && payload.assistantResponse.trim()) {
    normalized.assistantResponse = payload.assistantResponse.trim();
  } else {
    delete normalized.assistantResponse;
  }
  if (Array.isArray(payload.missingInfo)) {
    normalized.missingInfo = payload.missingInfo
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  } else {
    delete normalized.missingInfo;
  }
  if (typeof payload.shouldAskFollowup === "boolean") {
    normalized.shouldAskFollowup = payload.shouldAskFollowup;
  } else if (typeof payload.shouldAskFollowup === "string") {
    normalized.shouldAskFollowup = payload.shouldAskFollowup.trim().toLowerCase() === "true";
  } else {
    delete normalized.shouldAskFollowup;
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

  const rawDefaultChapterLength = payload.defaultChapterLength;
  if (typeof rawDefaultChapterLength === "string" && /^\d+$/.test(rawDefaultChapterLength.trim())) {
    normalized.defaultChapterLength = Math.max(500, Math.min(10000, Number(rawDefaultChapterLength.trim())));
  } else if (typeof rawDefaultChapterLength === "number" && Number.isFinite(rawDefaultChapterLength)) {
    normalized.defaultChapterLength = Math.max(500, Math.min(10000, Math.floor(rawDefaultChapterLength)));
  } else {
    delete normalized.defaultChapterLength;
  }

  if (
    looksLikeCurrentNovelOverviewQuery(String(normalized.goal ?? input.goal), input)
    && (
      normalized.intent === "general_chat"
      || normalized.intent === "unknown"
      || normalized.intent == null
    )
  ) {
    normalized.intent = "query_novel_production_status";
    normalized.requiresNovelContext = true;
    normalized.interactionMode = "query";
    normalized.assistantResponse = "execute";
    normalized.shouldAskFollowup = false;
    normalized.missingInfo = [];
  }

  return normalized;
}
