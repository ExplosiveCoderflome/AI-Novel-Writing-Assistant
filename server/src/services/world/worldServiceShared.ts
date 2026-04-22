import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  WorldLayerKey,
  WorldStructuredData,
  WorldStructureSectionKey,
} from "@ai-novel/shared/types/world";
import type {
  WorldOptionRefinementLevel,
  WorldReferenceMode,
} from "@ai-novel/shared/types/worldWizard";
import { WORLD_LAYER_ORDER } from "./worldTemplates";
import { normalizeWorldStructuredData } from "./worldStructure";
import {
  cleanJsonText as cleanCanonicalJsonText,
  extractJSONArray as extractCanonicalJSONArray,
  extractJSONObject as extractCanonicalJSONObject,
} from "../novel/novelP0Utils";

export const LAYER_STATUSES = ["pending", "generated", "confirmed", "stale"] as const;
export type LayerStatus = (typeof LAYER_STATUSES)[number];
export type RefineMode = "replace" | "alternatives";

export const WORLD_TEXT_FIELDS = [
  "description",
  "background",
  "geography",
  "cultures",
  "magicSystem",
  "politics",
  "races",
  "religions",
  "technology",
  "conflicts",
  "history",
  "economy",
  "factions",
] as const;
export type WorldTextField = (typeof WORLD_TEXT_FIELDS)[number];

const WORLD_TEXT_FIELD_SET = new Set<WorldTextField>(WORLD_TEXT_FIELDS);

const DEEPENING_LAYER_PRIMARY_FIELD: Record<WorldLayerKey, WorldTextField> = {
  foundation: "background",
  power: "magicSystem",
  society: "politics",
  culture: "cultures",
  history: "history",
  conflict: "conflicts",
};

const DEEPENING_TARGET_LAYER_ALIASES: Record<string, WorldLayerKey> = {
  foundation: "foundation",
  "基础": "foundation",
  "基础层": "foundation",
  "世界基础": "foundation",
  power: "power",
  "力量": "power",
  "力量层": "power",
  "能力体系": "power",
  society: "society",
  "社会": "society",
  "社会层": "society",
  "政治": "society",
  culture: "culture",
  "文化": "culture",
  "文化层": "culture",
  history: "history",
  "历史": "history",
  "历史层": "history",
  conflict: "conflict",
  "冲突": "conflict",
  "冲突层": "conflict",
};

const DEEPENING_TARGET_FIELD_ALIASES: Record<string, WorldTextField> = {
  description: "description",
  summary: "description",
  overview: "description",
  "世界概述": "description",
  "世界总览": "description",
  "概述": "description",
  "设定概述": "description",
  background: "background",
  "背景": "background",
  "基础背景": "background",
  "世界背景": "background",
  "故事背景": "background",
  "时代背景": "background",
  "起始背景": "background",
  "开局背景": "background",
  "角色定位": "background",
  "人物定位": "background",
  "身份定位": "background",
  "主角身份": "background",
  "时间地点": "background",
  "时间与地点": "background",
  "起始时间地点": "background",
  geography: "geography",
  location: "geography",
  "地理": "geography",
  "地理环境": "geography",
  "地理格局": "geography",
  "地图": "geography",
  "区域": "geography",
  "场景地点": "geography",
  cultures: "cultures",
  culture: "cultures",
  "文化": "cultures",
  "文化习俗": "cultures",
  "风俗": "cultures",
  "习俗": "cultures",
  "社会风貌": "cultures",
  magicsystem: "magicSystem",
  powersystem: "magicSystem",
  power: "magicSystem",
  "力量体系": "magicSystem",
  "能力体系": "magicSystem",
  "超凡体系": "magicSystem",
  politics: "politics",
  "政治": "politics",
  "政治结构": "politics",
  "社会结构": "politics",
  "权力结构": "politics",
  "阵营关系": "politics",
  "势力格局": "politics",
  races: "races",
  race: "races",
  "种族": "races",
  "族群": "races",
  religions: "religions",
  religion: "religions",
  "宗教": "religions",
  "信仰": "religions",
  technology: "technology",
  tech: "technology",
  "科技": "technology",
  "技术体系": "technology",
  conflicts: "conflicts",
  conflict: "conflicts",
  "冲突": "conflicts",
  "核心冲突": "conflicts",
  "首要冲突": "conflicts",
  "当前冲突": "conflicts",
  history: "history",
  "历史": "history",
  "历史事件": "history",
  "关键历史": "history",
  economy: "economy",
  "经济": "economy",
  "经济系统": "economy",
  "资源流通": "economy",
  factions: "factions",
  faction: "factions",
  organization: "factions",
  organizations: "factions",
  "势力": "factions",
  "势力关系": "factions",
  "组织势力": "factions",
  "主要势力": "factions",
};

export type LayerStateMap = Record<
  WorldLayerKey,
  {
    key: WorldLayerKey;
    status: LayerStatus;
    updatedAt: string;
  }
>;

export interface CreateWorldInput {
  name: string;
  description?: string;
  worldType?: string;
  templateKey?: string;
  axioms?: string;
  background?: string;
  geography?: string;
  cultures?: string;
  magicSystem?: string;
  politics?: string;
  races?: string;
  religions?: string;
  technology?: string;
  conflicts?: string;
  history?: string;
  economy?: string;
  factions?: string;
  selectedDimensions?: string;
  selectedElements?: string;
  knowledgeDocumentIds?: string[];
  structure?: unknown;
  bindingSupport?: unknown;
}

export interface WorldGenerateInput {
  name: string;
  description: string;
  worldType: string;
  complexity: "simple" | "standard" | "detailed";
  dimensions: {
    geography: boolean;
    culture: boolean;
    magicSystem: boolean;
    technology: boolean;
    history: boolean;
  };
  provider?: LLMProvider;
  model?: string;
}

export interface RefineWorldInput {
  attribute: WorldTextField;
  currentValue: string;
  refinementLevel: "light" | "deep";
  mode?: RefineMode;
  alternativesCount?: number;
  provider?: LLMProvider;
  model?: string;
}

export interface InspirationInput {
  input?: string;
  mode?: "free" | "reference" | "random";
  worldType?: string;
  knowledgeDocumentIds?: string[];
  referenceMode?: WorldReferenceMode;
  preserveElements?: string[];
  allowedChanges?: string[];
  forbiddenElements?: string[];
  refinementLevel?: WorldOptionRefinementLevel;
  optionsCount?: number;
  provider?: LLMProvider;
  model?: string;
}

export interface LayerGenerateInput {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface LayerUpdateInput {
  content: string;
}

export interface DeepeningAnswerInput {
  questionId: string;
  answer: string;
}

export interface ImportWorldInput {
  format: "json" | "markdown" | "text";
  content: string;
  name?: string;
  provider?: LLMProvider;
  model?: string;
}

export interface LibraryUseInput {
  worldId?: string;
  targetField?: WorldTextField;
  targetCollection?: "forces" | "locations";
}

export interface StructureBackfillInput {
  provider?: LLMProvider;
  model?: string;
}

export interface StructureGenerateInput extends StructureBackfillInput {
  section: WorldStructureSectionKey;
  structure?: unknown;
  bindingSupport?: unknown;
}

export interface StructureUpdateInput {
  structure: unknown;
  bindingSupport?: unknown;
}

export function cleanJsonText(source: string): string {
  return cleanCanonicalJsonText(source);
}

export function extractJSONObject(source: string): string {
  try {
    return extractCanonicalJSONObject(source);
  } catch {
    throw new Error("Invalid JSON object.");
  }
}

export function extractJSONArray(source: string): string {
  try {
    return extractCanonicalJSONArray(source);
  } catch {
    throw new Error("Invalid JSON array.");
  }
}

export function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function uniqueKnowledgeDocumentIds(ids: string[] | undefined): string[] {
  if (!ids || ids.length === 0) {
    return [];
  }
  return Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean)));
}

export function normalizeLayerStates(raw: string | null | undefined): LayerStateMap {
  const fallback = WORLD_LAYER_ORDER.reduce((acc, key) => {
    acc[key] = { key, status: "pending", updatedAt: nowISO() };
    return acc;
  }, {} as LayerStateMap);
  const parsed = safeParseJSON<Partial<LayerStateMap>>(raw, {});

  for (const key of WORLD_LAYER_ORDER) {
    const existing = parsed[key];
    fallback[key] = {
      key,
      status: LAYER_STATUSES.includes(existing?.status as LayerStatus)
        ? (existing?.status as LayerStatus)
        : "pending",
      updatedAt: existing?.updatedAt ?? fallback[key].updatedAt,
    };
  }
  return fallback;
}

export function markDownstreamStale(states: LayerStateMap, fromLayer: WorldLayerKey): LayerStateMap {
  const index = WORLD_LAYER_ORDER.indexOf(fromLayer);
  if (index < 0) {
    return states;
  }
  for (let i = index + 1; i < WORLD_LAYER_ORDER.length; i += 1) {
    const key = WORLD_LAYER_ORDER[i];
    if (states[key].status === "generated" || states[key].status === "confirmed") {
      states[key] = { ...states[key], status: "stale", updatedAt: nowISO() };
    }
  }
  return states;
}

export function buildFieldDiff(
  older: Partial<Record<WorldTextField, string | null>>,
  newer: Partial<Record<WorldTextField, string | null>>,
): Array<{ field: WorldTextField; before: string | null; after: string | null }> {
  const changes: Array<{ field: WorldTextField; before: string | null; after: string | null }> = [];
  for (const field of WORLD_TEXT_FIELDS) {
    const before = older[field] ?? null;
    const after = newer[field] ?? null;
    if ((before ?? "") !== (after ?? "")) {
      changes.push({ field, before, after });
    }
  }
  return changes;
}

export function buildWorldStructurePromptSource(world: {
  name: string;
  worldType?: string | null;
  description?: string | null;
  axioms?: string | null;
  background?: string | null;
  geography?: string | null;
  cultures?: string | null;
  magicSystem?: string | null;
  politics?: string | null;
  races?: string | null;
  religions?: string | null;
  technology?: string | null;
  conflicts?: string | null;
  history?: string | null;
  economy?: string | null;
  factions?: string | null;
}): string {
  return [
    `世界名称：${world.name}`,
    `世界类型：${world.worldType ?? "custom"}`,
    `世界概要：${world.description ?? "无"}`,
    `规则/公理：${world.axioms ?? "无"}`,
    `背景：${world.background ?? "无"}`,
    `地理：${world.geography ?? "无"}`,
    `文化：${world.cultures ?? "无"}`,
    `力量体系：${world.magicSystem ?? "无"}`,
    `政治：${world.politics ?? "无"}`,
    `种族：${world.races ?? "无"}`,
    `宗教：${world.religions ?? "无"}`,
    `科技：${world.technology ?? "无"}`,
    `冲突：${world.conflicts ?? "无"}`,
    `历史：${world.history ?? "无"}`,
    `经济：${world.economy ?? "无"}`,
    `势力：${world.factions ?? "无"}`,
  ].join("\n\n");
}

export function buildStructureSectionInstructions(section: WorldStructureSectionKey): string {
  switch (section) {
    case "profile":
      return `只输出 JSON 对象，结构为：
{
  "summary": "...",
  "identity": "...",
  "tone": "...",
  "themes": ["..."],
  "coreConflict": "..."
}`;
    case "rules":
      return `只输出 JSON 对象，结构为：
{
  "summary": "...",
  "axioms": [{"id":"rule-1","name":"...","summary":"...","cost":"...","boundary":"...","enforcement":"..."}],
  "taboo": ["..."],
  "sharedConsequences": ["..."]
}`;
    case "factions":
      return `只输出 JSON 对象，结构为：
{
  "factions": [{"id":"faction-1","name":"...","position":"...","doctrine":"...","goals":["..."],"methods":["..."],"representativeForceIds":["force-1"]}],
  "forces": [{"id":"force-1","name":"...","type":"...","factionId":"faction-1","summary":"...","baseOfPower":"...","currentObjective":"...","pressure":"...","leader":"...","narrativeRole":"..."}]
}
补充约束：
1. faction 是抽象阵营、立场、路线或世界站队，不是行业规则、社会压力机制或人际法则。
2. force 是具体组织、圈层、部门、公司、网络或机构，必须是能施压、能参与冲突、能与地点建立关系的行动主体。
3. 像“社会压力来源”“行业运作规则”“人际网络默认法则”这类世界级机制，应放到 rules，不要写进 factions / forces。`;
    case "locations":
      return `只输出 JSON 数组，元素结构为：
[{"id":"location-1","name":"...","terrain":"...","summary":"...","narrativeFunction":"...","risk":"...","entryConstraint":"...","exitCost":"...","controllingForceIds":["force-1"]}]`;
    case "relations":
      return `只输出 JSON 对象，结构为：
{
  "forceRelations": [{"id":"force-relation-1","sourceForceId":"force-1","targetForceId":"force-2","relation":"...","tension":"...","detail":"..."}],
  "locationControls": [{"id":"location-control-1","forceId":"force-1","locationId":"location-1","relation":"...","detail":"..."}]
}`;
    default:
      return "只输出合法 JSON。";
  }
}

export function mergeWorldStructureSection(
  current: WorldStructuredData,
  section: WorldStructureSectionKey,
  raw: unknown,
): WorldStructuredData {
  switch (section) {
    case "profile":
      return normalizeWorldStructuredData({
        ...current,
        profile: raw,
      }, current);
    case "rules":
      return normalizeWorldStructuredData({
        ...current,
        rules: raw,
      }, current);
    case "factions": {
      const record = raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
      return normalizeWorldStructuredData({
        ...current,
        factions: record.factions ?? current.factions,
        forces: record.forces ?? current.forces,
      }, current);
    }
    case "locations":
      return normalizeWorldStructuredData({
        ...current,
        locations: raw,
      }, current);
    case "relations":
      return normalizeWorldStructuredData({
        ...current,
        relations: raw,
      }, current);
    default:
      return current;
  }
}

export function normalizeAxiomList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized = raw
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const candidate = record.text ?? record.content ?? record.axiom ?? record.rule ?? record.value;
        if (typeof candidate === "string") {
          return candidate.trim();
        }
      }
      return "";
    })
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 5);
}

export function normalizeQuickOptionList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 4);
}

function normalizeAliasKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_\-:/\\|（）()【】\[\]·、，,。.!?？：:]/g, "");
}

export function normalizeDeepeningTargetLayer(raw: unknown): WorldLayerKey | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = normalizeAliasKey(raw);
  return DEEPENING_TARGET_LAYER_ALIASES[normalized] ?? null;
}

export function normalizeDeepeningTargetField(
  raw: unknown,
  targetLayer?: WorldLayerKey | null,
  questionText?: string | null,
): WorldTextField | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (WORLD_TEXT_FIELD_SET.has(trimmed as WorldTextField)) {
      return trimmed as WorldTextField;
    }
    const alias = DEEPENING_TARGET_FIELD_ALIASES[normalizeAliasKey(trimmed)];
    if (alias) {
      return alias;
    }
  }

  const question = questionText?.trim() ?? "";
  if (question) {
    const questionField = DEEPENING_TARGET_FIELD_ALIASES[normalizeAliasKey(question)];
    if (questionField) {
      return questionField;
    }
    if (/冲突|敌对|威胁|危机/i.test(question)) {
      return "conflicts";
    }
    if (/时间|历史|起源|前史|事件/i.test(question)) {
      return targetLayer === "foundation" ? "background" : "history";
    }
    if (/地点|地理|区域|地图|场景/i.test(question)) {
      return "geography";
    }
    if (/势力|阵营|权力|统治|政治/i.test(question)) {
      return "politics";
    }
    if (/力量|能力|超凡|魔法|技术/i.test(question)) {
      return /技术/i.test(question) ? "technology" : "magicSystem";
    }
    if (/文化|习俗|信仰|宗教/i.test(question)) {
      return /宗教|信仰/i.test(question) ? "religions" : "cultures";
    }
    if (/种族|族群/i.test(question)) {
      return "races";
    }
    if (/经济|资源|贸易/i.test(question)) {
      return "economy";
    }
    if (/角色|人物|身份|主角/i.test(question)) {
      return "background";
    }
  }

  if (targetLayer) {
    return DEEPENING_LAYER_PRIMARY_FIELD[targetLayer];
  }
  return null;
}
