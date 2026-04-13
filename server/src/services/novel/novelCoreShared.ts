import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { parseCommercialTagsJson } from "@ai-novel/shared/types/novelFraming";
import { normalizeStoryModeOutput } from "../storyMode/storyModeProfile";

export interface PaginationInput {
  page: number;
  limit: number;
}

export interface CreateNovelInput {
  title: string;
  description?: string;
  targetAudience?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  commercialTags?: string[];
  genreId?: string;
  primaryStoryModeId?: string;
  secondaryStoryModeId?: string;
  worldId?: string;
  writingMode?: "original" | "continuation";
  projectMode?: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";
  narrativePov?: "first_person" | "third_person" | "mixed";
  pacePreference?: "slow" | "balanced" | "fast";
  styleTone?: string;
  emotionIntensity?: "low" | "medium" | "high";
  aiFreedom?: "low" | "medium" | "high";
  defaultChapterLength?: number;
  estimatedChapterCount?: number;
  projectStatus?: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  storylineStatus?: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  outlineStatus?: "not_started" | "in_progress" | "completed" | "rework" | "blocked";
  resourceReadyScore?: number;
  sourceNovelId?: string | null;
  sourceKnowledgeDocumentId?: string | null;
  continuationBookAnalysisId?: string | null;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[] | null;
}

export interface UpdateNovelInput {
  title?: string;
  description?: string;
  targetAudience?: string | null;
  bookSellingPoint?: string | null;
  competingFeel?: string | null;
  first30ChapterPromise?: string | null;
  commercialTags?: string[] | null;
  status?: "draft" | "published";
  writingMode?: "original" | "continuation";
  projectMode?: "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline" | null;
  narrativePov?: "first_person" | "third_person" | "mixed" | null;
  pacePreference?: "slow" | "balanced" | "fast" | null;
  styleTone?: string | null;
  emotionIntensity?: "low" | "medium" | "high" | null;
  aiFreedom?: "low" | "medium" | "high" | null;
  defaultChapterLength?: number | null;
  estimatedChapterCount?: number | null;
  projectStatus?: "not_started" | "in_progress" | "completed" | "rework" | "blocked" | null;
  storylineStatus?: "not_started" | "in_progress" | "completed" | "rework" | "blocked" | null;
  outlineStatus?: "not_started" | "in_progress" | "completed" | "rework" | "blocked" | null;
  resourceReadyScore?: number | null;
  sourceNovelId?: string | null;
  sourceKnowledgeDocumentId?: string | null;
  continuationBookAnalysisId?: string | null;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[] | null;
  genreId?: string | null;
  primaryStoryModeId?: string | null;
  secondaryStoryModeId?: string | null;
  worldId?: string | null;
  outline?: string | null;
  structuredOutline?: string | null;
}

export interface ChapterInput {
  title: string;
  order: number;
  content?: string;
  expectation?: string;
  chapterStatus?: "unplanned" | "pending_generation" | "generating" | "pending_review" | "needs_repair" | "completed";
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
  repairHistory?: string | null;
  qualityScore?: number | null;
  continuityScore?: number | null;
  characterScore?: number | null;
  pacingScore?: number | null;
  riskFlags?: string | null;
}

export interface CharacterInput {
  name: string;
  role: string;
  gender?: "male" | "female" | "other" | "unknown";
  castRole?: string;
  storyFunction?: string;
  relationToProtagonist?: string;
  personality?: string;
  background?: string;
  development?: string;
  outerGoal?: string;
  innerNeed?: string;
  fear?: string;
  wound?: string;
  misbelief?: string;
  secret?: string;
  moralLine?: string;
  firstImpression?: string;
  arcStart?: string;
  arcMidpoint?: string;
  arcClimax?: string;
  arcEnd?: string;
  currentState?: string;
  currentGoal?: string;
  baseCharacterId?: string;
}

export interface LLMGenerateOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface OutlineGenerateOptions extends LLMGenerateOptions {
  initialPrompt?: string;
}

export interface StructuredOutlineGenerateOptions extends LLMGenerateOptions {
  totalChapters?: number;
}

export interface ChapterGenerateOptions extends LLMGenerateOptions {
  previousChaptersSummary?: string[];
}

export interface GenerateBeatOptions extends LLMGenerateOptions {
  targetChapters?: number;
}

export interface TitleGenerateOptions extends LLMGenerateOptions {
  count?: number;
}

export interface PipelineRunOptions extends LLMGenerateOptions {
  startOrder: number;
  endOrder: number;
  maxRetries?: number;
  runMode?: "fast" | "polish";
  autoReview?: boolean;
  autoRepair?: boolean;
  skipCompleted?: boolean;
  qualityThreshold?: number;
  repairMode?: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
}

export interface PipelinePayload extends LLMGenerateOptions {
  maxRetries?: number;
  runMode?: "fast" | "polish";
  autoReview?: boolean;
  autoRepair?: boolean;
  skipCompleted?: boolean;
  qualityThreshold?: number;
  repairMode?: "detect_only" | "light_repair" | "heavy_repair" | "continuity_only" | "character_only" | "ending_only";
}

export interface StorylineDraftInput {
  content: string;
  diffSummary?: string;
  baseVersion?: number;
}

export interface StorylineImpactInput {
  versionId?: string;
  content?: string;
}

export interface ReviewOptions extends LLMGenerateOptions {
  content?: string;
}

export interface RepairOptions extends LLMGenerateOptions {
  reviewIssues?: ReviewIssue[];
  auditIssueIds?: string[];
}

export interface HookGenerateOptions extends LLMGenerateOptions {
  chapterId?: string;
}

export interface CharacterTimelineSyncOptions {
  startOrder?: number;
  endOrder?: number;
}

const QUALITY_THRESHOLD = { coherence: 80, repetition: 20, engagement: 75 };
type BeatStatus = "planned" | "completed" | "skipped";

const CONTINUATION_ANALYSIS_SECTION_KEYS: BookAnalysisSectionKey[] = [
  "overview",
  "plot_structure",
  "timeline",
  "character_system",
  "worldbuilding",
  "themes",
  "style_technique",
  "market_highlights",
];

const CONTINUATION_ANALYSIS_SECTION_KEY_SET = new Set<BookAnalysisSectionKey>(CONTINUATION_ANALYSIS_SECTION_KEYS);
export const DEFAULT_ESTIMATED_CHAPTER_COUNT = 80;

export function normalizeNovelOutput<T extends {
  continuationBookAnalysisSections?: string | null;
  commercialTagsJson?: string | null;
  bookContract?: {
    id: string;
    novelId: string;
    readingPromise: string;
    protagonistFantasy: string;
    coreSellingPoint: string;
    chapter3Payoff: string;
    chapter10Payoff: string;
    chapter30Payoff: string;
    escalationLadder: string;
    relationshipMainline: string;
    absoluteRedLinesJson: string;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
  primaryStoryMode?: {
    id: string;
    name: string;
    description?: string | null;
    template?: string | null;
    parentId?: string | null;
    profileJson?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
  secondaryStoryMode?: {
    id: string;
    name: string;
    description?: string | null;
    template?: string | null;
    parentId?: string | null;
    profileJson?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
}>(
  novel: T,
): Omit<T, "continuationBookAnalysisSections" | "commercialTagsJson"> & {
  continuationBookAnalysisSections: BookAnalysisSectionKey[] | null;
  commercialTags: string[];
} {
  const {
    continuationBookAnalysisSections,
    commercialTagsJson,
    ...rest
  } = novel;
  return {
    ...rest,
    continuationBookAnalysisSections: parseContinuationBookAnalysisSections(continuationBookAnalysisSections),
    commercialTags: parseCommercialTagsJson(commercialTagsJson),
    ...(rest.bookContract !== undefined
      ? {
        bookContract: rest.bookContract
          ? (() => {
            const {
              absoluteRedLinesJson,
              createdAt,
              updatedAt,
              ...bookContractRest
            } = rest.bookContract;
            return {
              ...bookContractRest,
              absoluteRedLines: (() => {
              try {
                const parsed = JSON.parse(absoluteRedLinesJson) as unknown;
                return Array.isArray(parsed)
                  ? parsed.filter((item): item is string => typeof item === "string")
                  : [];
              } catch {
                return [];
              }
              })(),
              createdAt: new Date(createdAt).toISOString(),
              updatedAt: new Date(updatedAt).toISOString(),
            };
          })()
          : null,
      }
      : {}),
    ...(rest.primaryStoryMode !== undefined
      ? {
          primaryStoryMode: rest.primaryStoryMode ? normalizeStoryModeOutput(rest.primaryStoryMode) : null,
        }
      : {}),
    ...(rest.secondaryStoryMode !== undefined
      ? {
          secondaryStoryMode: rest.secondaryStoryMode ? normalizeStoryModeOutput(rest.secondaryStoryMode) : null,
        }
      : {}),
  };
}

export function logPipelineInfo(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.info(`[pipeline] ${message}`, meta);
    return;
  }
  console.info(`[pipeline] ${message}`);
}

export function logPipelineWarn(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.warn(`[pipeline] ${message}`, meta);
    return;
  }
  console.warn(`[pipeline] ${message}`);
}

export function logPipelineError(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.error(`[pipeline] ${message}`, meta);
    return;
  }
  console.error(`[pipeline] ${message}`);
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

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

export function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("未检测到有效 JSON 对象");
  }
  return text.slice(first, last + 1);
}

export function extractJSONArray(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("未检测到有效 JSON 数组");
  }
  return text.slice(first, last + 1);
}

function clamp(score: number): number {
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
  const text = content.replace(/\s+/g, " ").trim();
  const sentences = text.split(/[。！"?]/).map((item) => item.trim()).filter(Boolean);
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

export function isPass(score: QualityScore): boolean {
  return score.coherence >= QUALITY_THRESHOLD.coherence
    && score.repetition <= QUALITY_THRESHOLD.repetition
    && score.engagement >= QUALITY_THRESHOLD.engagement;
}

export function briefSummary(
  content: string,
  facts?: Array<{ category: "plot" | "character" | "world"; content: string }>,
): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  const extractedFacts = (facts ?? extractFacts(content))
    .map((item) => ({ ...item, content: item.content.trim() }))
    .filter((item) => item.content.length > 0);

  const pickUnique = (items: string[], maxItems = 3): string[] => {
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

  const plotEvents = pickUnique(extractedFacts.filter((item) => item.category === "plot").map((item) => item.content), 2);
  const characterStates = pickUnique(extractedFacts.filter((item) => item.category === "character").map((item) => item.content), 2);
  const worldFacts = pickUnique(extractedFacts.filter((item) => item.category === "world").map((item) => item.content), 1);

  const blocks: string[] = [];
  if (plotEvents.length > 0) {
    blocks.push(`Plot: ${plotEvents.join("")}`);
  }
  if (characterStates.length > 0) {
    blocks.push(`Character: ${characterStates.join("")}`);
  }
  if (worldFacts.length > 0) {
    blocks.push(`World: ${worldFacts.join("")}`);
  }
  if (blocks.length > 0) {
    return blocks.join("\n");
  }

  const sentences = text.split(/[。！"?]/).map((item) => item.trim()).filter(Boolean);
  if (sentences.length === 0) {
    return text.length <= 220 ? text : `${text.slice(0, 220)}...`;
  }
  const middle = sentences[Math.floor((sentences.length - 1) / 2)] ?? "";
  const tail = sentences[sentences.length - 1] ?? "";
  const fallback = [middle, tail].filter(Boolean).join("");
  if (fallback) {
    return `Plot: ${fallback}`;
  }
  return text.length <= 220 ? text : `${text.slice(0, 220)}...`;
}

export function extractFacts(content: string): Array<{ category: "plot" | "character" | "world"; content: string }> {
  const lines = content.split(/[\n。！"?]/).map((item) => item.trim()).filter((item) => item.length >= 8).slice(0, 6);
  return lines.map((line) => {
    if (/世界|地理|宗门|王朝|大陆|规则/.test(line)) {
      return { category: "world" as const, content: line };
    }
    if (/主角|反派|角色|他/.test(line)) {
      return { category: "character" as const, content: line };
    }
    return { category: "plot" as const, content: line };
  });
}

export function extractCharacterEventLines(content: string, characterName: string, limit = 3): string[] {
  if (!characterName.trim()) {
    return [];
  }
  return content
    .split(/[\n。！"?]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8 && item.includes(characterName))
    .slice(0, limit);
}

export function normalizeBeatStatus(value: unknown): BeatStatus {
  if (value === "completed" || value === "已完" || value === "finish" || value === "done") {
    return "completed";
  }
  if (value === "skipped" || value === "跳过") {
    return "skipped";
  }
  return "planned";
}

export function normalizeBeatOrder(value: unknown, fallback: number): number {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.max(1, Math.floor(raw));
}

export function parseContinuationBookAnalysisSections(raw: string | null | undefined): BookAnalysisSectionKey[] | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    const keys = parsed
      .map((item) => (typeof item === "string" ? item : ""))
      .filter((item): item is BookAnalysisSectionKey => CONTINUATION_ANALYSIS_SECTION_KEY_SET.has(item as BookAnalysisSectionKey));
    if (keys.length === 0) {
      return null;
    }
    return Array.from(new Set(keys));
  } catch {
    return null;
  }
}

export function serializeContinuationBookAnalysisSections(
  value: BookAnalysisSectionKey[] | null | undefined,
): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const normalized = value.filter((item) => CONTINUATION_ANALYSIS_SECTION_KEY_SET.has(item));
  if (normalized.length === 0) {
    return null;
  }
  return JSON.stringify(Array.from(new Set(normalized)));
}

export function normalizeOptionalTextForCreate(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

export function normalizeOptionalTextForUpdate(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}

function normalizeStorylineLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function estimateChangedLines(previousContent: string, nextContent: string): number {
  const previous = normalizeStorylineLines(previousContent);
  const next = normalizeStorylineLines(nextContent);
  const maxLength = Math.max(previous.length, next.length);
  let changed = 0;
  for (let index = 0; index < maxLength; index += 1) {
    if ((previous[index] ?? "") !== (next[index] ?? "")) {
      changed += 1;
    }
  }
  return changed;
}

export function buildStorylineDiffSummary(previousContent: string, nextContent: string): string {
  const previous = normalizeStorylineLines(previousContent);
  const next = normalizeStorylineLines(nextContent);
  const changedLines = estimateChangedLines(previousContent, nextContent);
  const addedLines = Math.max(0, next.length - previous.length);
  const removedLines = Math.max(0, previous.length - next.length);
  return `changed=${changedLines}; added=${addedLines}; removed=${removedLines}`;
}

export function countCharacterMentions(content: string, names: string[]): number {
  const normalized = content.replace(/\s+/g, "");
  const uniqueNames = Array.from(new Set(names.filter((name) => name.trim().length > 0)));
  return uniqueNames.filter((name) => normalized.includes(name.replace(/\s+/g, ""))).length;
}

export function estimateAffectedChapterCount(content: string, chapterTotal: number, changedLines: number): number {
  const explicitMatches = content.match(/第?\s*\d+\s*章/g) ?? [];
  if (explicitMatches.length > 0) {
    return Math.min(chapterTotal, explicitMatches.length);
  }
  if (chapterTotal <= 0) {
    return 0;
  }
  const inferred = Math.max(1, Math.ceil(changedLines / 4));
  return Math.min(chapterTotal, inferred);
}
