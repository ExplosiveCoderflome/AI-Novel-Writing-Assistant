import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { ragServices } from "../rag";
import { getRagQueryForChapter, novelReferenceService } from "./NovelReferenceService";
import { NovelContinuationService } from "./NovelContinuationService";
import {
  buildStructuredOutlineRepairSystemPrompt,
  buildStructuredOutlineSystemPrompt,
  parseStrictStructuredOutline,
  stringifyStructuredOutline,
  toOutlineChapterRows,
} from "./structuredOutline";
import type { RagOwnerType } from "../rag/types";

interface PaginationInput {
  page: number;
  limit: number;
}

interface CreateNovelInput {
  title: string;
  description?: string;
  genreId?: string;
  worldId?: string;
  writingMode?: "original" | "continuation";
  sourceNovelId?: string | null;
  sourceKnowledgeDocumentId?: string | null;
  continuationBookAnalysisId?: string | null;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[] | null;
}

interface UpdateNovelInput {
  title?: string;
  description?: string;
  status?: "draft" | "published";
  writingMode?: "original" | "continuation";
  sourceNovelId?: string | null;
  sourceKnowledgeDocumentId?: string | null;
  continuationBookAnalysisId?: string | null;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[] | null;
  genreId?: string | null;
  worldId?: string | null;
  outline?: string | null;
  structuredOutline?: string | null;
}

interface ChapterInput {
  title: string;
  order: number;
  content?: string;
  expectation?: string;
}

interface CharacterInput {
  name: string;
  role: string;
  personality?: string;
  background?: string;
  development?: string;
  currentState?: string;
  currentGoal?: string;
  baseCharacterId?: string;
}

interface LLMGenerateOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface OutlineGenerateOptions extends LLMGenerateOptions {
  initialPrompt?: string;
}

interface StructuredOutlineGenerateOptions extends LLMGenerateOptions {
  totalChapters?: number;
}

interface ChapterGenerateOptions extends LLMGenerateOptions {
  previousChaptersSummary?: string[];
}

interface GenerateBeatOptions extends LLMGenerateOptions {
  targetChapters?: number;
}

interface PipelineRunOptions extends LLMGenerateOptions {
  startOrder: number;
  endOrder: number;
  maxRetries?: number;
}

interface PipelinePayload extends LLMGenerateOptions {
  maxRetries?: number;
}

interface ReviewOptions extends LLMGenerateOptions {
  content?: string;
}

interface RepairOptions extends LLMGenerateOptions {
  reviewIssues?: ReviewIssue[];
}

interface HookGenerateOptions extends LLMGenerateOptions {
  chapterId?: string;
}

interface CharacterTimelineSyncOptions {
  startOrder?: number;
  endOrder?: number;
}

const QUALITY_THRESHOLD = { coherence: 80, repetition: 20, engagement: 75 };
const OPENING_COMPARE_LIMIT = 3;
const OPENING_SLICE_LENGTH = 220;
const OPENING_NGRAM_SIZE = 4;
const OPENING_SIMILARITY_THRESHOLD = 0.42;
type BeatStatus = "planned" | "completed" | "skipped";

function logPipelineInfo(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.info(`[pipeline] ${message}`, meta);
    return;
  }
  console.info(`[pipeline] ${message}`);
}

function logPipelineWarn(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.warn(`[pipeline] ${message}`, meta);
    return;
  }
  console.warn(`[pipeline] ${message}`);
}

function logPipelineError(message: string, meta?: Record<string, unknown>) {
  if (meta) {
    console.error(`[pipeline] ${message}`, meta);
    return;
  }
  console.error(`[pipeline] ${message}`);
}

function toText(content: unknown): string {
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

function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("未检测到有效 JSON 对象");
  }
  return text.slice(first, last + 1);
}

function extractJSONArray(source: string): string {
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

function normalizeScore(value: Partial<QualityScore>): QualityScore {
  const coherence = clamp(value.coherence ?? 0);
  const repetition = clamp(value.repetition ?? 100);
  const pacing = clamp(value.pacing ?? 0);
  const voice = clamp(value.voice ?? 0);
  const engagement = clamp(value.engagement ?? 0);
  const overall = clamp(value.overall ?? (coherence + (100 - repetition) + pacing + voice + engagement) / 5);
  return { coherence, repetition, pacing, voice, engagement, overall };
}

function ruleScore(content: string): QualityScore {
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

function isPass(score: QualityScore): boolean {
  return score.coherence >= QUALITY_THRESHOLD.coherence
    && score.repetition <= QUALITY_THRESHOLD.repetition
    && score.engagement >= QUALITY_THRESHOLD.engagement;
}

function normalizeOpeningText(content: string): string {
  return content
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、“”‘’（）《》【】\[\]\(\)!?,.:;'"`~\-_/\\|@#$%^&*+=<>]/g, "")
    .trim();
}

function extractOpening(content: string, maxLength = OPENING_SLICE_LENGTH): string {
  const text = content.replace(/\s+/g, " ").trim();
  return text.slice(0, maxLength);
}

function buildNGramSet(source: string, n = OPENING_NGRAM_SIZE): Set<string> {
  const normalized = normalizeOpeningText(source);
  if (!normalized) {
    return new Set<string>();
  }
  if (normalized.length <= n) {
    return new Set<string>([normalized]);
  }
  const grams = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i += 1) {
    grams.add(normalized.slice(i, i + n));
  }
  return grams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function openingSimilarity(a: string, b: string): number {
  return jaccardSimilarity(buildNGramSet(a), buildNGramSet(b));
}

function briefSummary(content: string, facts?: Array<{ category: "plot" | "character" | "world"; content: string }>): string {
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

function extractFacts(content: string): Array<{ category: "plot" | "character" | "world"; content: string }> {
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

function extractCharacterEventLines(content: string, characterName: string, limit = 3): string[] {
  if (!characterName.trim()) {
    return [];
  }
  return content
    .split(/[\n。！"?]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8 && item.includes(characterName))
    .slice(0, limit);
}

function parseReviewOutput(text: string): { score: QualityScore; issues: ReviewIssue[] } {
  try {
    const parsed = JSON.parse(extractJSONObject(text)) as {
      score?: Partial<QualityScore>;
      scores?: Partial<QualityScore>;
      issues?: ReviewIssue[];
    };
    return {
      score: normalizeScore(parsed.score ?? parsed.scores ?? {}),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    };
  } catch {
    return { score: ruleScore(text), issues: [] };
  }
}

function normalizeBeatStatus(value: unknown): BeatStatus {
  if (value === "completed" || value === "已完" || value === "finish" || value === "done") {
    return "completed";
  }
  if (value === "skipped" || value === "跳过") {
    return "skipped";
  }
  return "planned";
}

function normalizeBeatOrder(value: unknown, fallback: number): number {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  const normalized = Math.max(1, Math.floor(raw));
  return normalized;
}

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

function parseContinuationBookAnalysisSections(raw: string | null | undefined): BookAnalysisSectionKey[] | null {
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

function serializeContinuationBookAnalysisSections(
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

const novelContinuationService = new NovelContinuationService();

export class NovelService {
  private normalizeNovelOutput<T extends { continuationBookAnalysisSections?: string | null }>(
    novel: T,
  ): Omit<T, "continuationBookAnalysisSections"> & { continuationBookAnalysisSections: BookAnalysisSectionKey[] | null } {
    const parsedSections = parseContinuationBookAnalysisSections(novel.continuationBookAnalysisSections);
    return {
      ...novel,
      continuationBookAnalysisSections: parsedSections,
    };
  }

  async listNovels({ page, limit }: PaginationInput) {
    const [items, total] = await Promise.all([
      prisma.novel.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          genre: true,
          world: { select: { id: true, name: true, worldType: true } },
          bible: true,
          _count: { select: { chapters: true, characters: true, plotBeats: true } },
        },
      }),
      prisma.novel.count(),
    ]);

    return {
      items: items.map((item) => this.normalizeNovelOutput(item)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async createNovel(input: CreateNovelInput) {
    const writingMode = input.writingMode ?? "original";
    const sourceNovelId = input.sourceNovelId ?? null;
    const sourceKnowledgeDocumentId = input.sourceKnowledgeDocumentId ?? null;
    const continuationBookAnalysisId = input.continuationBookAnalysisId ?? null;
    const normalizedContinuationBookAnalysisId =
      writingMode === "continuation" && (sourceNovelId || sourceKnowledgeDocumentId) ? continuationBookAnalysisId : null;
    const continuationBookAnalysisSections = serializeContinuationBookAnalysisSections(
      input.continuationBookAnalysisSections,
    );
    await novelContinuationService.validateWritingModeConfig({
      writingMode,
      sourceNovelId,
      sourceKnowledgeDocumentId,
      continuationBookAnalysisId: normalizedContinuationBookAnalysisId,
    });

    const created = await prisma.novel.create({
      data: {
        title: input.title,
        description: input.description,
        genreId: input.genreId,
        worldId: input.worldId,
        writingMode,
        sourceNovelId: writingMode === "continuation" ? sourceNovelId : null,
        sourceKnowledgeDocumentId: writingMode === "continuation" ? sourceKnowledgeDocumentId : null,
        continuationBookAnalysisId: normalizedContinuationBookAnalysisId,
        continuationBookAnalysisSections:
          writingMode === "continuation"
          && (sourceNovelId || sourceKnowledgeDocumentId)
          && normalizedContinuationBookAnalysisId
            ? continuationBookAnalysisSections
            : null,
      },
    });
    this.queueRagUpsert("novel", created.id);
    if (created.worldId) {
      this.queueRagUpsert("world", created.worldId);
    }
    return this.normalizeNovelOutput(created);
  }

  async getNovelById(id: string) {
    const row = await prisma.novel.findUnique({
      where: { id },
      include: {
        genre: true,
        world: true,
        bible: true,
        chapters: { orderBy: { order: "asc" }, include: { chapterSummary: true } },
        characters: { orderBy: { createdAt: "asc" } },
        plotBeats: { orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!row) {
      return null;
    }
    return this.normalizeNovelOutput(row);
  }

  async updateNovel(id: string, input: UpdateNovelInput) {
    const existing = await prisma.novel.findUnique({
      where: { id },
      select: {
        id: true,
        writingMode: true,
        sourceNovelId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        continuationBookAnalysisSections: true,
      },
    });
    if (!existing) {
      throw new Error("小说不存在");
    }
    const nextWritingMode = input.writingMode ?? (existing.writingMode === "continuation" ? "continuation" : "original");
    const nextSourceNovelId = input.sourceNovelId !== undefined ? input.sourceNovelId : existing.sourceNovelId;
    const nextSourceKnowledgeDocumentId = input.sourceKnowledgeDocumentId !== undefined
      ? input.sourceKnowledgeDocumentId
      : existing.sourceKnowledgeDocumentId;
    const nextContinuationBookAnalysisId = input.continuationBookAnalysisId !== undefined
      ? input.continuationBookAnalysisId
      : existing.continuationBookAnalysisId;
    const nextContinuationBookAnalysisSections = input.continuationBookAnalysisSections !== undefined
      ? input.continuationBookAnalysisSections
      : parseContinuationBookAnalysisSections(existing.continuationBookAnalysisSections);
    const normalizedNextContinuationBookAnalysisId =
      nextWritingMode === "continuation" && (nextSourceNovelId || nextSourceKnowledgeDocumentId)
        ? nextContinuationBookAnalysisId
        : null;

    await novelContinuationService.validateWritingModeConfig({
      novelId: id,
      writingMode: nextWritingMode,
      sourceNovelId: nextSourceNovelId,
      sourceKnowledgeDocumentId: nextSourceKnowledgeDocumentId,
      continuationBookAnalysisId: normalizedNextContinuationBookAnalysisId,
    });

    const { continuationBookAnalysisSections: _ignoreSectionPatch, ...restInput } = input;
    const serializedContinuationSections = serializeContinuationBookAnalysisSections(nextContinuationBookAnalysisSections);
    const updated = await prisma.novel.update({
      where: { id },
      data: {
        ...restInput,
        sourceNovelId: nextWritingMode === "continuation" ? nextSourceNovelId : null,
        sourceKnowledgeDocumentId: nextWritingMode === "continuation" ? nextSourceKnowledgeDocumentId : null,
        continuationBookAnalysisId: normalizedNextContinuationBookAnalysisId,
        continuationBookAnalysisSections:
          nextWritingMode === "continuation"
          && (nextSourceNovelId || nextSourceKnowledgeDocumentId)
          && normalizedNextContinuationBookAnalysisId
            ? serializedContinuationSections
            : null,
      },
    });
    this.queueRagUpsert("novel", id);
    if (updated.worldId) {
      this.queueRagUpsert("world", updated.worldId);
    }
    return this.normalizeNovelOutput(updated);
  }

  async deleteNovel(id: string) {
    this.queueRagDelete("novel", id);
    this.queueRagDelete("bible", id);
    await prisma.novel.delete({ where: { id } });
  }

  async listChapters(novelId: string) {
    return prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      include: { chapterSummary: true },
    });
  }

  async createChapter(novelId: string, input: ChapterInput) {
    const chapter = await prisma.chapter.create({
      data: {
        novelId,
        title: input.title,
        order: input.order,
        content: input.content ?? "",
        expectation: input.expectation,
        generationState: "planned",
      },
    });
    if (chapter.content) {
      await this.syncChapterArtifacts(novelId, chapter.id, chapter.content);
    }
    this.queueRagUpsert("chapter", chapter.id);
    return chapter;
  }

  async updateChapter(novelId: string, chapterId: string, input: Partial<ChapterInput>) {
    const exists = await prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { id: true } });
    if (!exists) {
      throw new Error("章节不存在");
    }
    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: { title: input.title, order: input.order, content: input.content },
    });
    if (typeof input.content === "string") {
      await this.syncChapterArtifacts(novelId, chapterId, input.content);
    }
    this.queueRagUpsert("chapter", chapterId);
    return chapter;
  }

  async deleteChapter(novelId: string, chapterId: string) {
    this.queueRagDelete("chapter", chapterId);
    this.queueRagDelete("chapter_summary", chapterId);
    const deleted = await prisma.chapter.deleteMany({ where: { id: chapterId, novelId } });
    if (deleted.count === 0) {
      throw new Error("章节不存在");
    }
  }

  async listCharacters(novelId: string) {
    return prisma.character.findMany({ where: { novelId }, orderBy: { createdAt: "asc" } });
  }

  async createCharacter(novelId: string, input: CharacterInput) {
    let payload: CharacterInput = { ...input };
    if (input.baseCharacterId) {
      const baseCharacter = await prisma.baseCharacter.findUnique({
        where: { id: input.baseCharacterId },
      });
      if (!baseCharacter) {
        throw new Error("基础角色不存在");
      }
      payload = {
        ...payload,
        personality: input.personality ?? baseCharacter.personality,
        background: input.background ?? baseCharacter.background,
        development: input.development ?? baseCharacter.development,
      };
    }
    const created = await prisma.character.create({ data: { novelId, ...payload } });
    this.queueRagUpsert("character", created.id);
    return created;
  }

  async updateCharacter(novelId: string, characterId: string, input: Partial<CharacterInput>) {
    const exists = await prisma.character.findFirst({
      where: { id: characterId, novelId },
      select: { id: true, currentState: true, currentGoal: true },
    });
    if (!exists) {
      throw new Error("角色不存在");
    }
    const hasStateChanged = typeof input.currentState === "string" && input.currentState !== exists.currentState;
    const hasGoalChanged = typeof input.currentGoal === "string" && input.currentGoal !== exists.currentGoal;
    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        ...input,
        ...(hasStateChanged || hasGoalChanged ? { lastEvolvedAt: new Date() } : {}),
      },
    });
    this.queueRagUpsert("character", updated.id);
    return updated;
  }

  async deleteCharacter(novelId: string, characterId: string) {
    this.queueRagDelete("character", characterId);
    const deleted = await prisma.character.deleteMany({ where: { id: characterId, novelId } });
    if (deleted.count === 0) {
      throw new Error("角色不存在");
    }
  }

  async listCharacterTimeline(novelId: string, characterId: string) {
    return prisma.characterTimeline.findMany({
      where: { novelId, characterId },
      orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async syncCharacterTimeline(
    novelId: string,
    characterId: string,
    options: CharacterTimelineSyncOptions = {},
  ) {
    const character = await prisma.character.findFirst({
      where: { id: characterId, novelId },
    });
    if (!character) {
      throw new Error("角色不存在");
    }

    const chapters = await prisma.chapter.findMany({
      where: {
        novelId,
        ...(typeof options.startOrder === "number" || typeof options.endOrder === "number"
          ? {
            order: {
              gte: options.startOrder ?? undefined,
              lte: options.endOrder ?? undefined,
            },
          }
          : {}),
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        title: true,
        content: true,
      },
    });

    const events: Array<{
      novelId: string;
      characterId: string;
      chapterId: string;
      chapterOrder: number;
      title: string;
      content: string;
      source: string;
    }> = [];

    for (const chapter of chapters) {
      const content = chapter.content ?? "";
      if (!content) {
        continue;
      }
      const lines = extractCharacterEventLines(content, character.name, 3);
      for (const line of lines) {
        events.push({
          novelId,
          characterId,
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          title: `${chapter.order}"· ${chapter.title}`,
          content: line,
          source: "chapter_extract",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.characterTimeline.deleteMany({
        where: {
          novelId,
          characterId,
          source: "chapter_extract",
          ...(typeof options.startOrder === "number" || typeof options.endOrder === "number"
            ? {
              chapterOrder: {
                gte: options.startOrder ?? undefined,
                lte: options.endOrder ?? undefined,
              },
            }
            : {}),
        },
      });
      if (events.length > 0) {
        await tx.characterTimeline.createMany({
          data: events,
        });
      }
    });

    const total = await prisma.characterTimeline.count({
      where: { novelId, characterId },
    });

    return {
      characterId,
      syncedCount: events.length,
      totalTimelineCount: total,
    };
  }

  async syncAllCharacterTimeline(novelId: string, options: CharacterTimelineSyncOptions = {}) {
    const characters = await prisma.character.findMany({
      where: { novelId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (characters.length === 0) {
      return {
        characterCount: 0,
        syncedCount: 0,
        details: [] as Array<{ characterId: string; syncedCount: number; totalTimelineCount: number }>,
      };
    }

    const details = await Promise.all(
      characters.map((character) => this.syncCharacterTimeline(novelId, character.id, options)),
    );
    const syncedCount = details.reduce((sum, item) => sum + item.syncedCount, 0);

    return {
      characterCount: characters.length,
      syncedCount,
      details,
    };
  }

  async evolveCharacter(
    novelId: string,
    characterId: string,
    options: LLMGenerateOptions = {},
  ) {
    const [novel, character, timelines] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        include: { bible: true },
      }),
      prisma.character.findFirst({
        where: { id: characterId, novelId },
      }),
      prisma.characterTimeline.findMany({
        where: { novelId, characterId },
        orderBy: [{ chapterOrder: "desc" }, { createdAt: "desc" }],
        take: 20,
      }),
    ]);

    if (!novel || !character) {
      throw new Error("小说或角色不存在");
    }    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.4,
    });

    const timelineText = timelines.length > 0
      ? timelines
        .map((item) => `${item.title}: ${item.content}`)
        .join("\n")
      : "暂无时间线事件";
    let ragContext = "";
    try {
      ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
        `角色演进 ${character.name}\n${timelineText}`,
        {
          novelId,
          ownerTypes: ["character", "character_timeline", "chapter_summary", "consistency_fact", "novel", "bible"],
          finalTopK: 6,
        },
      );
    } catch {
      ragContext = "";
    }

    const result = await llm.invoke([
      new SystemMessage(
        `你是小说角色发展编辑。请基于角色经历输出 JSON"
{
  "personality":"更新后的性格",
  "background":"更新后的背景信息（可选）",
  "development":"更新后的成长轨迹",
  "currentState":"角色当前状",
  "currentGoal":"角色当前目标"
}
仅输"JSON。`,
      ),
      new HumanMessage(
        `小说${novel.title}
作品圣经${novel.bible?.rawContent ?? "暂无"}
角色${character.name}(${character.role})
现有设定"
personality=${character.personality ?? "暂无"}
background=${character.background ?? "暂无"}
development=${character.development ?? "暂无"}
currentState=${character.currentState ?? "暂无"}
currentGoal=${character.currentGoal ?? "暂无"}

时间线事件：
${timelineText}
检索补充：
${ragContext || ""}`,
      ),
    ]);

    const parsed = JSON.parse(extractJSONObject(toText(result.content))) as Partial<{
      personality: string;
      background: string;
      development: string;
      currentState: string;
      currentGoal: string;
    }>;

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        personality: parsed.personality ?? character.personality,
        background: parsed.background ?? character.background,
        development: parsed.development ?? character.development,
        currentState: parsed.currentState ?? character.currentState,
        currentGoal: parsed.currentGoal ?? character.currentGoal,
        lastEvolvedAt: new Date(),
      },
    });

    await prisma.characterTimeline.create({
      data: {
        novelId,
        characterId,
        title: `角色演进更新 · ${new Date().toLocaleString("zh-CN")}`,
        content: `状态：${updated.currentState ?? "暂无"}；目标：${updated.currentGoal ?? "暂无"}`,
        source: "ai_evolve",
      },
    });

    return updated;
  }

  async checkCharacterAgainstWorld(
    novelId: string,
    characterId: string,
    options: LLMGenerateOptions = {},
  ) {
    const [novel, character] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        include: { world: true },
      }),
      prisma.character.findFirst({
        where: { id: characterId, novelId },
      }),
    ]);
    if (!novel || !character) {
      throw new Error("小说或角色不存在");
    }
    if (!novel.world) {
      return {
        status: "pass" as const,
        warnings: ["当前小说未绑定世界观，无法执行严格世界规则检查"],
        issues: [],
      };
    }

    const worldContext = this.buildWorldContextFromNovel(novel);
    try {    const llm = await getLLM(options.provider ?? "deepseek", {
        model: options.model,
        temperature: options.temperature ?? 0.2,
      });
      const result = await llm.invoke([
        new SystemMessage(
          `你是角色设定审计员。请输出 JSON"
{
  "status":"pass|warn|error",
  "warnings":["..."],
  "issues":[{"severity":"warn|error","message":"...","suggestion":"..."}]
}
仅输"JSON。`,
        ),
        new HumanMessage(
          `世界规则"
${worldContext}

角色设定"
name=${character.name}
role=${character.role}
personality=${character.personality ?? ""}
background=${character.background ?? ""}
development=${character.development ?? ""}
currentState=${character.currentState ?? ""}
currentGoal=${character.currentGoal ?? ""}`,
        ),
      ]);
      const parsed = JSON.parse(extractJSONObject(toText(result.content))) as {
        status?: "pass" | "warn" | "error";
        warnings?: string[];
        issues?: Array<{ severity: "warn" | "error"; message: string; suggestion?: string }>;
      };
      return {
        status: parsed.status ?? "pass",
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch {
      return {
        status: "warn" as const,
        warnings: ["AI 检查失败，返回规则回退结果"],
        issues: [] as Array<{ severity: "warn" | "error"; message: string; suggestion?: string }>,
      };
    }
  }

  async createOutlineStream(novelId: string, options: OutlineGenerateOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { world: true, characters: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }
    const [worldContext, referenceContext] = await Promise.all([
      Promise.resolve(this.buildWorldContextFromNovel(novel)),
      novelReferenceService.buildReferenceForStage(novelId, "outline"),
    ]);
    const referenceBlock = referenceContext.trim()
      ? `\n\n参考资料（来自已有作品拆书分析，可借鉴但不必照搬）：\n${referenceContext}`
      : "";
    const charactersText = novel.characters.length > 0
      ? novel.characters
          .map((c) => `- ${c.name}（${c.role}）${c.personality ? `：${c.personality.slice(0, 80)}` : ""}`)
          .join("\n")
      : "暂无";
    const initialPrompt = options.initialPrompt?.trim() ?? "";
    const initialPromptBlock = initialPrompt
      ? `\n\n用户本次生成补充提示词（优先参考，不能违背角色和世界设定）：\n${initialPrompt.slice(0, 2000)}`
      : "";
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.7,
    });
    const stream = await llm.stream([
      new SystemMessage("你是一位专业的小说发展走向策划师，请严格基于给定角色设定输出完整发展走向，不得自行发明角色"),
      new HumanMessage(
        `小说标题：${novel.title}
小说简介：${novel.description ?? ""}
核心角色（必须使用这些角色，不得替换或忽略）：
${charactersText}
世界上下文：
${worldContext}${referenceBlock}${initialPromptBlock}`,
      ),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        await prisma.novel.update({ where: { id: novelId }, data: { outline: fullContent } });
        this.queueRagUpsert("novel", novelId);
      },
    };
  }

  async createStructuredOutlineStream(novelId: string, options: StructuredOutlineGenerateOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { world: true, characters: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }
    await this.ensureNovelCharacters(novelId, "生成结构化大");
    if (!novel.outline) {
      throw new Error("请先生成小说发展走向");
    }
    const [worldContext, referenceContext] = await Promise.all([
      Promise.resolve(this.buildWorldContextFromNovel(novel)),
      novelReferenceService.buildReferenceForStage(novelId, "structured_outline"),
    ]);
    const referenceBlock = referenceContext.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${referenceContext}`
      : "";
    const charactersText = novel.characters.length > 0
      ? novel.characters
          .map((c) => `- ${c.name}${c.role}${c.personality ? `${c.personality.slice(0, 80)}` : ""}`)
          .join("\n")
      : "暂无";
    const totalChapters = options.totalChapters ?? 20;
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.2,
    });
    const stream = await llm.stream([
      new SystemMessage(buildStructuredOutlineSystemPrompt(totalChapters)),
      new HumanMessage(
        `核心角色（必须使用这些角色，不得替换或忽略）"
${charactersText}
世界上下文：
${worldContext}
基于下述发展走向，生成${totalChapters}章规划：
${novel.outline}${referenceBlock}

输出规则：
1. 只能输出 JSON 数组
2. 每个对象只能包含 chapter/title/summary/key_events/roles
3. chapter 必须从 1 开始连续编号
4. key_events 和 roles 必须是非空字符串数组`,
      ),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        let normalized: ReturnType<typeof parseStrictStructuredOutline>;
        try {
          normalized = parseStrictStructuredOutline(fullContent, totalChapters);
        } catch (error) {
          const repaired = await this.repairStructuredOutlineOutput(
            fullContent,
            totalChapters,
            options,
            error instanceof Error ? error.message : "invalid structured outline",
          );
          normalized = parseStrictStructuredOutline(repaired, totalChapters);
        }
        const structuredOutline = stringifyStructuredOutline(normalized);
        await prisma.novel.update({ where: { id: novelId }, data: { structuredOutline } });
        const chapters = toOutlineChapterRows(normalized);
        if (chapters.length > 0) {
          await this.syncChaptersFromOutline(novelId, chapters);
        }
        this.queueRagUpsert("novel", novelId);
      },
    };
  }

  private async repairStructuredOutlineOutput(
    rawContent: string,
    totalChapters: number,
    options: StructuredOutlineGenerateOptions,
    reason: string,
  ): Promise<string> {
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: 0.1,
    });
    const result = await llm.invoke([
      new SystemMessage(buildStructuredOutlineRepairSystemPrompt(totalChapters)),
      new HumanMessage(
        `请把下面内容修正为严格结构化 JSON 数组。
校验失败原因：${reason}

原始内容：
${rawContent}`,
      ),
    ]);
    return toText(result.content);
  }

  private async syncChaptersFromOutline(
    novelId: string,
    chapters: Array<{ order: number; title: string; summary: string }>,
  ) {
    const existing = await prisma.chapter.findMany({
      where: { novelId },
      select: { id: true, order: true },
    });
    const existingByOrder = new Map(existing.map((c) => [c.order, c.id]));
    await Promise.all(
      chapters.map((ch) => {
        const existingId = existingByOrder.get(ch.order);
        if (existingId) {
          return prisma.chapter.update({
            where: { id: existingId },
            data: { title: ch.title, expectation: ch.summary },
          });
        }
        return prisma.chapter.create({
          data: {
            novelId,
            title: ch.title,
            order: ch.order,
            content: "",
            expectation: ch.summary,
            generationState: "planned",
          },
        });
      }),
    );
  }

  async createChapterStream(novelId: string, chapterId: string, options: ChapterGenerateOptions = {}) {
    const [novel, chapter] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId }, include: { characters: true } }),
      prisma.chapter.findFirst({ where: { id: chapterId, novelId } }),
    ]);
    if (!novel || !chapter) {
      throw new Error("Novel or chapter not found.");
    }
    await this.ensureNovelCharacters(novelId, "generate chapter content");    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.8,
    });
    const context = options.previousChaptersSummary?.join("\n") || (await this.buildContextText(novelId, chapter.order));
    const openingHint = await this.buildOpeningConstraintHint(novelId, chapter.order);
    const continuationPack = await novelContinuationService.buildChapterContextPack(novelId);
    const charactersText = novel.characters.length > 0
      ? novel.characters
          .map((c) => `- ${c.name} (${c.role})${c.personality ? `: ${c.personality.slice(0, 100)}` : ""}`)
          .join("\n")
      : "none";
    const chapterPlan = chapter.expectation?.trim()
      ? `\nChapter plan (must follow):\n${chapter.expectation}`
      : "";

    const stream = await llm.stream([
      new SystemMessage(
        `You are a web-novel writer. Output must be Simplified Chinese.
Write 2000-3000 Chinese characters based on character settings, chapter plan and context.
Hard requirements:
1) Advance new plot events; do not retell completed events.
2) Callback references are allowed but must be short; do not reuse long context sentences.
3) Do not add new core characters or rewrite fixed settings.
4) Chapter ending must include a new suspense/conflict/decision point.
5) The opening 2-4 sentences must differ from recent chapters in scene trigger, temporal cue and sentence pattern.
6) Avoid repetitive opening templates such as "I am X..." or "I am checking delivery updates in office...".
${continuationPack.enabled ? `7) ${continuationPack.systemRule}` : ""}`.trim(),
      ),
      new HumanMessage(
        `Novel: ${novel.title}
Core characters (must remain consistent):
${charactersText}
Chapter: ${chapter.order} - ${chapter.title}${chapterPlan}
Context:
${context}

Opening anti-repeat constraints:
${openingHint}

${continuationPack.enabled ? `${continuationPack.humanBlock}\n` : ""}

If an event is already covered in prior chapters, mention it in at most one sentence and move on to new events.`,
      ),
    ]);

    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const openingGuard = await this.enforceOpeningDiversity(
          novelId,
          chapter.order,
          chapter.title,
          fullContent,
          options,
        );
        const continuationGuard = await novelContinuationService.rewriteIfTooSimilar({
          chapterTitle: chapter.title,
          content: openingGuard.content,
          continuationPack,
          provider: options.provider,
          model: options.model,
          temperature: options.temperature,
        });
        const finalContent = continuationGuard.content;
        await prisma.chapter.update({
          where: { id: chapterId },
          data: { content: finalContent, generationState: "drafted" },
        });
        await this.syncChapterArtifacts(novelId, chapterId, finalContent);
      },
    };
  }

  async generateTitles(
    novelId: string,
    options: LLMGenerateOptions = {},
  ): Promise<{ titles: Array<{ title: string; clickRate: number; style: "literary" | "conflict" }> }> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { genre: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.9,
    });
    const result = await llm.invoke([
      new SystemMessage(
        "你是网文标题专家，请输出 JSON：{\"titles\":[{\"title\":\"...\",\"clickRate\":85,\"style\":\"literary/conflict\"}]}",
      ),
      new HumanMessage(`小说类型${novel.genre?.name ?? "未分"}\n小说简介：${novel.description ?? ""}`),
    ]);
    const parsed = JSON.parse(cleanJsonText(toText(result.content))) as {
      titles: Array<{ title: string; clickRate: number; style: "literary" | "conflict" }>;
    };
    return parsed;
  }

  async createBibleStream(novelId: string, options: LLMGenerateOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { characters: true, genre: true, world: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }
    await this.ensureNovelCharacters(novelId, "生成作品圣经");
    const [worldContext, referenceContext] = await Promise.all([
      Promise.resolve(this.buildWorldContextFromNovel(novel)),
      novelReferenceService.buildReferenceForStage(novelId, "bible"),
    ]);
    const referenceBlock = referenceContext.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${referenceContext}`
      : "";    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.6,
    });
    const stream = await llm.stream([
      new SystemMessage(
        `你是网文总编，请输出作品圣经 JSON"
{
  "coreSetting":"核心设定",
  "forbiddenRules":"禁止冲突规则",
  "mainPromise":"主线承诺",
  "characterArcs":"核心角色成长",
  "worldRules":"世界运行规则"
}
仅输"JSON。`,
      ),
      new HumanMessage(
        `小说标题${novel.title}
类型${novel.genre?.name ?? "未分"}
简介：${novel.description ?? ""}
角色${novel.characters.map((item) => `${item.name}(${item.role})`).join("") || "暂无"}
世界上下文：
${worldContext}${referenceBlock}`,
      ),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const parsed = JSON.parse(extractJSONObject(fullContent)) as Record<string, string>;
        await prisma.novelBible.upsert({
          where: { novelId },
          update: {
            coreSetting: parsed.coreSetting ?? null,
            forbiddenRules: parsed.forbiddenRules ?? null,
            mainPromise: parsed.mainPromise ?? null,
            characterArcs: parsed.characterArcs ?? null,
            worldRules: parsed.worldRules ?? null,
            rawContent: JSON.stringify(parsed),
          },
          create: {
            novelId,
            coreSetting: parsed.coreSetting ?? null,
            forbiddenRules: parsed.forbiddenRules ?? null,
            mainPromise: parsed.mainPromise ?? null,
            characterArcs: parsed.characterArcs ?? null,
            worldRules: parsed.worldRules ?? null,
            rawContent: JSON.stringify(parsed),
          },
        });
        this.queueRagUpsert("bible", novelId);
      },
    };
  }

  async createBeatStream(novelId: string, options: GenerateBeatOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { bible: true, chapters: true, world: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }
    await this.ensureNovelCharacters(novelId, "生成剧情拍点");
    const [worldContext, referenceContext] = await Promise.all([
      Promise.resolve(this.buildWorldContextFromNovel(novel)),
      novelReferenceService.buildReferenceForStage(novelId, "beats"),
    ]);
    const referenceBlock = referenceContext.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${referenceContext}`
      : "";    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.7,
    });
    const targetChapters = options.targetChapters ?? Math.max(30, novel.chapters.length || 30);
    const stream = await llm.stream([
      new SystemMessage(
        "你是网文剧情策划，请输出 JSON 数组，每项字段：chapterOrder/beatType/title/content/status",
      ),
      new HumanMessage(
        `小说标题${novel.title}
小说简介：${novel.description ?? ""}
世界上下文：${worldContext}
作品圣经${novel.bible?.rawContent ?? "暂无"}
目标章节${targetChapters}${referenceBlock}`,
      ),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const beats = JSON.parse(extractJSONArray(fullContent)) as Array<{
          chapterOrder?: number | string;
          beatType?: string;
          title?: string;
          content?: string;
          status?: string;
        }>;
        const normalizedBeats = beats.map((item, index) => ({
          novelId,
          chapterOrder: normalizeBeatOrder(item.chapterOrder, index + 1),
          beatType: String(item.beatType ?? "main").slice(0, 120),
          title: String(item.title ?? `拍点 ${index + 1}`).slice(0, 200),
          content: String(item.content ?? ""),
          status: normalizeBeatStatus(item.status),
        }));
        await prisma.$transaction(async (tx) => {
          await tx.plotBeat.deleteMany({ where: { novelId } });
          if (normalizedBeats.length > 0) {
            await tx.plotBeat.createMany({
              data: normalizedBeats,
            });
          }
        });
      },
    };
  }

  async startPipelineJob(novelId: string, options: PipelineRunOptions) {
    await this.ensureNovelCharacters(novelId, "启动批量章节流水");
    const chapterStats = await prisma.chapter.aggregate({
      where: { novelId },
      _min: { order: true },
      _max: { order: true },
      _count: { order: true },
    });

    if ((chapterStats._count.order ?? 0) === 0) {
      throw new Error("当前小说还没有章节，请先创建章节后再启动流水线");
    }

    const chapters = await prisma.chapter.findMany({
      where: {
        novelId,
        order: { gte: options.startOrder, lte: options.endOrder },
      },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (chapters.length === 0) {
      const minOrder = chapterStats._min.order ?? 1;
      const maxOrder = chapterStats._max.order ?? 1;
      throw new Error(
        `指定区间内没有可生成的章节。当前可用章节范围为"${minOrder} 章到"${maxOrder} 章。`,
      );
    }
    logPipelineInfo("创建批量任务", {
      novelId,
      range: `${options.startOrder}-${options.endOrder}`,
      matchedChapters: chapters.length,
      availableRange: `${chapterStats._min.order ?? 1}-${chapterStats._max.order ?? 1}`,
      maxRetries: options.maxRetries ?? 2,
      provider: options.provider ?? "deepseek",
      model: options.model ?? "",
    });
    const job = await prisma.generationJob.create({
      data: {
        novelId,
        startOrder: options.startOrder,
        endOrder: options.endOrder,
        status: "queued",
        totalCount: chapters.length,
        maxRetries: options.maxRetries ?? 2,
        currentStage: "queued",
        payload: JSON.stringify({
          provider: options.provider ?? "deepseek",
          model: options.model ?? "",
          temperature: options.temperature ?? 0.8,
        }),
      },
    });
    logPipelineInfo("批量任务已入", {
      jobId: job.id,
      novelId,
      totalCount: job.totalCount,
    });
    void this.executePipeline(job.id, novelId, options).catch(() => {
      // 防止后台任务未处理拒绝导致进程不稳定
    });
    return job;
  }

  async getPipelineJob(novelId: string, jobId: string) {
    return prisma.generationJob.findFirst({ where: { id: jobId, novelId } });
  }

  async getPipelineJobById(jobId: string) {
    return prisma.generationJob.findUnique({ where: { id: jobId } });
  }

  async retryPipelineJob(jobId: string) {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new Error("任务不存在。");
    }
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new Error("仅失败或已取消的任务支持重试。");
    }
    const payload = this.parsePipelinePayload(job.payload);
    return this.startPipelineJob(job.novelId, {
      startOrder: job.startOrder,
      endOrder: job.endOrder,
      maxRetries: job.maxRetries,
      provider: payload.provider,
      model: payload.model,
      temperature: payload.temperature,
    });
  }

  async cancelPipelineJob(jobId: string) {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new Error("任务不存在。");
    }
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      throw new Error("仅排队中或运行中的任务可取消。");
    }
    if (job.status === "queued") {
      return prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          cancelRequestedAt: null,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          finishedAt: new Date(),
        },
      });
    }
    return prisma.generationJob.update({
      where: { id: jobId },
      data: {
        cancelRequestedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  }

  async reviewChapter(novelId: string, chapterId: string, options: ReviewOptions = {}) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      include: { novel: true },
    });
    if (!chapter) {
      throw new Error("章节不存在");
    }
    const review = await this.reviewChapterContent(
      chapter.novel.title,
      chapter.title,
      options.content ?? chapter.content ?? "",
      options,
      novelId,
    );
    await prisma.chapter.update({ where: { id: chapterId }, data: { generationState: "reviewed" } });
    await this.createQualityReport(novelId, chapterId, review.score, review.issues);
    return review;
  }

  async createRepairStream(novelId: string, chapterId: string, options: RepairOptions = {}) {
    const [novel, chapter, bible] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId } }),
      prisma.chapter.findFirst({ where: { id: chapterId, novelId } }),
      prisma.novelBible.findUnique({ where: { novelId } }),
    ]);
    if (!novel || !chapter) {
      throw new Error("小说或章节不存在");
    }
    const issues = options.reviewIssues ?? (await this.reviewChapter(novelId, chapterId, options)).issues;    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.5,
    });
    let ragContext = "";
    try {
      ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
        `章节修复 ${novel.title}\n${chapter.title}\n${chapter.content ?? ""}`,
        {
          novelId,
          ownerTypes: ["novel", "chapter", "chapter_summary", "consistency_fact", "character", "bible"],
          finalTopK: 8,
        },
      );
    } catch {
      ragContext = "";
    }
    const stream = await llm.stream([
      new SystemMessage("你是资深网文编辑，请基于审校问题修复章节，保证主线和口吻一致"),
      new HumanMessage(
        `小说标题${novel.title}
作品圣经${bible?.rawContent ?? "暂无"}
章节标题${chapter.title}
原始正文"
${chapter.content ?? ""}
审校问题"
${JSON.stringify(issues, null, 2)}
检索补充：
${ragContext || ""}
请输出修复后的完整章节正文。`,
      ),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        await prisma.chapter.update({
          where: { id: chapterId },
          data: { content: fullContent, generationState: "repaired" },
        });
        await this.syncChapterArtifacts(novelId, chapterId, fullContent);
        const review = await this.reviewChapter(novelId, chapterId, { ...options, content: fullContent });
        if (isPass(review.score)) {
          await prisma.chapter.update({ where: { id: chapterId }, data: { generationState: "approved" } });
        }
      },
    };
  }

  async getQualityReport(novelId: string) {
    const reports = await prisma.qualityReport.findMany({
      where: { novelId },
      orderBy: { createdAt: "desc" },
    });
    if (reports.length === 0) {
      return { novelId, summary: normalizeScore({}), chapterReports: [] };
    }
    const map = new Map<string, (typeof reports)[number]>();
    for (const report of reports) {
      if (report.chapterId && !map.has(report.chapterId)) {
        map.set(report.chapterId, report);
      }
    }
    const chapterReports = Array.from(map.values());
    const source = chapterReports.length > 0 ? chapterReports : reports;
    const total = source.length;
    const summary = normalizeScore({
      coherence: source.reduce((sum, item) => sum + item.coherence, 0) / total,
      repetition: source.reduce((sum, item) => sum + item.repetition, 0) / total,
      pacing: source.reduce((sum, item) => sum + item.pacing, 0) / total,
      voice: source.reduce((sum, item) => sum + item.voice, 0) / total,
      engagement: source.reduce((sum, item) => sum + item.engagement, 0) / total,
      overall: source.reduce((sum, item) => sum + item.overall, 0) / total,
    });
    return { novelId, summary, chapterReports: source, totalReports: reports.length };
  }

  async generateChapterHook(novelId: string, options: HookGenerateOptions = {}) {
    const chapter = options.chapterId
      ? await prisma.chapter.findFirst({ where: { id: options.chapterId, novelId } })
      : await prisma.chapter.findFirst({ where: { novelId }, orderBy: { order: "desc" } });
    if (!chapter) {
      throw new Error("未找到可生成钩子的章节");
    }    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.8,
    });
    const result = await llm.invoke([
      new SystemMessage(
        "你是网文运营编辑。请输出 JSON：{\"hook\":\"章节末钩子\",\"nextExpectation\":\"下章期待点\"}",
      ),
      new HumanMessage(`章节标题${chapter.title}\n章节内容：\n${(chapter.content ?? "").slice(-1800)}`),
    ]);
    const payload = JSON.parse(extractJSONObject(toText(result.content))) as {
      hook?: string;
      nextExpectation?: string;
    };
    const hook = payload.hook ?? "";
    const expectation = payload.nextExpectation ?? "";
    await prisma.chapter.update({
      where: { id: chapter.id },
      data: { hook, expectation },
    });
    await prisma.chapterSummary.upsert({
      where: { chapterId: chapter.id },
      update: { hook },
      create: { novelId, chapterId: chapter.id, summary: briefSummary(chapter.content ?? ""), hook },
    });
    this.queueRagUpsert("chapter", chapter.id);
    this.queueRagUpsert("chapter_summary", chapter.id);
    return { chapterId: chapter.id, hook, nextExpectation: expectation };
  }

  private queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => {
      // keep primary workflow resilient even when rag queueing fails
    });
  }

  private queueRagDelete(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueDelete(ownerType, ownerId).catch(() => {
      // keep primary workflow resilient even when rag queueing fails
    });
  }

  private buildWorldContextFromNovel(
    novel: { world?: {
      name: string;
      worldType?: string | null;
      description?: string | null;
      axioms?: string | null;
      background?: string | null;
      geography?: string | null;
      magicSystem?: string | null;
      politics?: string | null;
      races?: string | null;
      religions?: string | null;
      technology?: string | null;
      conflicts?: string | null;
      history?: string | null;
      economy?: string | null;
      factions?: string | null;
    } | null } | null,
  ): string {
    const world = novel?.world;
    if (!world) {
      return "世界上下文：暂无";
    }
    let axiomsText = "";
    if (world.axioms) {
      try {
        const parsed = JSON.parse(world.axioms) as string[];
        axiomsText = Array.isArray(parsed) && parsed.length > 0
          ? parsed.map((item) => `- ${item}`).join("\n")
          : world.axioms;
      } catch {
        axiomsText = world.axioms;
      }
    }
    return `世界上下文：
世界名称${world.name}
世界类型${world.worldType ?? "未指"}
世界简介：${world.description ?? ""}
核心公理"
${axiomsText}
背景${world.background ?? ""}
地理${world.geography ?? ""}
力量体系${world.magicSystem ?? ""}
社会政治${world.politics ?? ""}
种族${world.races ?? ""}
宗教${world.religions ?? ""}
科技${world.technology ?? ""}
历史${world.history ?? ""}
经济${world.economy ?? ""}
势力关系${world.factions ?? ""}
核心冲突${world.conflicts ?? ""}`;
  }

  private async buildContextText(novelId: string, chapterOrder: number): Promise<string> {
    const [bible, summaries, facts, novel, styleReference, characters, recentChapters] = await Promise.all([
      prisma.novelBible.findUnique({ where: { novelId } }),
      prisma.chapterSummary.findMany({
        where: {
          novelId,
          chapter: { order: { lt: chapterOrder } },
        },
        include: { chapter: true },
        orderBy: { chapter: { order: "desc" } },
        take: 5,
      }),
      prisma.consistencyFact.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.novel.findUnique({
        where: { id: novelId },
        include: { world: true },
      }),
      novelReferenceService.buildReferenceForStage(novelId, "chapter"),
      prisma.character.findMany({ where: { novelId }, orderBy: { createdAt: "asc" } }),
      prisma.chapter.findMany({
        where: {
          novelId,
          order: { lt: chapterOrder },
          content: { not: null },
        },
        orderBy: { order: "desc" },
        take: 2,
        select: { order: true, title: true, content: true },
      }),
    ]);

    const bibleText = bible
      ? `作品圣经"主线承诺${bible.mainPromise ?? ""}
核心设定${bible.coreSetting ?? ""}
禁止冲突${bible.forbiddenRules ?? ""}
角色成长弧：${bible.characterArcs ?? ""}
世界规则${bible.worldRules ?? ""}`
      : "作品圣经：暂";

    const summaryText = summaries.length > 0
      ? `最近章节摘要：\n${summaries.map((item) => `${item.chapter.order}章：${item.summary}`).join("\n")}`
      : "最近章节摘要：暂无";

    const factText = facts.length > 0
      ? `最近关键事实：\n${facts.map((item) => `[${item.category}] ${item.content}`).join("\n")}`
      : "最近关键事实：暂无";

    const recentChapterContentText = recentChapters.length > 0
      ? `最近章节正文片段（避免重复描写）：\n${recentChapters
          .map((item) => {
            const digest = (item.content ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
            return `${item.order}章${item.title}》：${digest}`;
          })
          .filter((item) => item.trim().length > 0)
          .join("\n")}`
      : "最近章节正文片段：暂无";

    const worldText = this.buildWorldContextFromNovel(novel);
    const outlineText = novel?.outline?.trim()
      ? `发展走向：\n${novel.outline.slice(0, 800)}`
      : "";
    const charactersContextText = characters.length > 0
      ? `角色设定：\n${characters
          .map((c) => `- ${c.name}${c.role}${c.personality ? `${c.personality.slice(0, 80)}` : ""}`)
          .join("\n")}`
      : "";

    const ragQuery = getRagQueryForChapter(
      chapterOrder,
      novel?.title ?? "",
      novel?.structuredOutline ?? null,
    );
    let ragText = "";
    try {
      ragText = await ragServices.hybridRetrievalService.buildContextBlock(ragQuery, {
        novelId,
      });
    } catch {
      ragText = "";
    }

    const styleBlock = styleReference.trim()
      ? `文风参考（来自拆书分析）：\n${styleReference}`
      : "";

    return [
      worldText,
      outlineText,
      charactersContextText,
      bibleText,
      summaryText,
      factText,
      recentChapterContentText,
      ragText ? `语义检索补充：\n${ragText}` : "",
      styleBlock,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private async buildOpeningConstraintHint(novelId: string, chapterOrder: number): Promise<string> {
    const recentChapters = await prisma.chapter.findMany({
      where: {
        novelId,
        order: { lt: chapterOrder },
        content: { not: null },
      },
      orderBy: { order: "desc" },
      take: OPENING_COMPARE_LIMIT,
      select: { order: true, title: true, content: true },
    });
    const openingList = recentChapters
      .map((item) => ({
        order: item.order,
        title: item.title,
        opening: extractOpening(item.content ?? ""),
      }))
      .filter((item) => item.opening.length > 0);
    if (openingList.length === 0) {
      return "Recent openings: none.";
    }
    return [
      "Recent openings (do not reuse the same opening structure or sentence starter):",
      ...openingList.map((item) => `- Chapter ${item.order} ${item.title}: ${item.opening}`),
    ].join("\n");
  }

  private async enforceOpeningDiversity(
    novelId: string,
    chapterOrder: number,
    chapterTitle: string,
    content: string,
    options: LLMGenerateOptions = {},
  ): Promise<{ content: string; rewritten: boolean; maxSimilarity: number }> {
    const trimmed = content.trim();
    if (!trimmed) {
      return { content, rewritten: false, maxSimilarity: 0 };
    }
    const currentOpening = extractOpening(trimmed);
    if (!currentOpening) {
      return { content, rewritten: false, maxSimilarity: 0 };
    }

    const recentChapters = await prisma.chapter.findMany({
      where: {
        novelId,
        order: { lt: chapterOrder },
        content: { not: null },
      },
      orderBy: { order: "desc" },
      take: OPENING_COMPARE_LIMIT,
      select: { order: true, title: true, content: true },
    });
    const compared = recentChapters
      .map((item) => ({
        order: item.order,
        title: item.title,
        opening: extractOpening(item.content ?? ""),
      }))
      .filter((item) => item.opening.length > 0);
    if (compared.length === 0) {
      return { content, rewritten: false, maxSimilarity: 0 };
    }

    const maxSimilarity = compared.reduce((max, item) => {
      return Math.max(max, openingSimilarity(currentOpening, item.opening));
    }, 0);
    if (maxSimilarity < OPENING_SIMILARITY_THRESHOLD) {
      return { content, rewritten: false, maxSimilarity };
    }

    try {    const llm = await getLLM(options.provider ?? "deepseek", {
        model: options.model,
        temperature: options.temperature ?? 0.5,
      });
      const forbiddenOpenings = compared
        .map((item) => `- Chapter ${item.order} ${item.title}: ${item.opening}`)
        .join("\n");
      const rewritten = await llm.invoke([
        new SystemMessage(
          `You are a chapter rewrite editor.
Keep the original plot facts, character logic and ending hook.
Output must be Simplified Chinese and full chapter text.
Hard rule: rewrite the opening paragraph with a clearly different sentence pattern, scene trigger and temporal cue.`,
        ),
        new HumanMessage(
          `Chapter title: ${chapterTitle}
Current full content:
${trimmed}

Forbidden opening patterns:
${forbiddenOpenings}

Rewrite full chapter. Keep the same core events but change the opening style significantly.`,
        ),
      ]);
      const rewrittenContent = toText(rewritten.content).trim();
      if (!rewrittenContent) {
        return { content, rewritten: false, maxSimilarity };
      }
      const rewrittenOpening = extractOpening(rewrittenContent);
      if (!rewrittenOpening) {
        return { content, rewritten: false, maxSimilarity };
      }
      const rewrittenMaxSimilarity = compared.reduce((max, item) => {
        return Math.max(max, openingSimilarity(rewrittenOpening, item.opening));
      }, 0);
      if (rewrittenMaxSimilarity >= maxSimilarity) {
        return { content, rewritten: false, maxSimilarity };
      }
      return { content: rewrittenContent, rewritten: true, maxSimilarity: rewrittenMaxSimilarity };
    } catch {
      return { content, rewritten: false, maxSimilarity };
    }
  }

  private async ensureNovelCharacters(novelId: string, actionName: string, minCount = 1) {
    const count = await prisma.character.count({ where: { novelId } });
    if (count < minCount) {
      throw new Error(`请先在本小说中至少添"${minCount} 个角色后${actionName}。`);
    }
  }

  private async syncChapterArtifacts(novelId: string, chapterId: string, content: string) {
    const facts = extractFacts(content);
    const summary = briefSummary(content, facts);
    await prisma.$transaction(async (tx) => {
      await tx.chapterSummary.upsert({
        where: { chapterId },
        update: {
          summary,
          keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
          characterStates: facts.filter((item) => item.category === "character").map((item) => item.content).slice(0, 3).join(""),
        },
        create: {
          novelId,
          chapterId,
          summary,
          keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
          characterStates: facts.filter((item) => item.category === "character").map((item) => item.content).slice(0, 3).join(""),
        },
      });
      await tx.consistencyFact.deleteMany({ where: { novelId, chapterId } });
      if (facts.length > 0) {
        await tx.consistencyFact.createMany({
          data: facts.map((item) => ({
            novelId,
            chapterId,
            category: item.category,
            content: item.content,
            source: "chapter_auto_extract",
          })),
        });
      }
    });
    await this.syncCharacterTimelineForChapter(novelId, chapterId, content);
    this.queueRagUpsert("chapter", chapterId);
    this.queueRagUpsert("chapter_summary", chapterId);
    this.queueRagUpsert("novel", novelId);
    const factRows = await prisma.consistencyFact.findMany({
      where: { novelId, chapterId },
      select: { id: true },
    });
    for (const fact of factRows) {
      this.queueRagUpsert("consistency_fact", fact.id);
    }
  }

  private async syncCharacterTimelineForChapter(novelId: string, chapterId: string, content: string) {
    const [chapter, characters] = await Promise.all([
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: { order: true, title: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true },
      }),
    ]);

    if (!chapter || characters.length === 0) {
      return;
    }

    const events: Array<{
      novelId: string;
      characterId: string;
      chapterId: string;
      chapterOrder: number;
      title: string;
      content: string;
      source: string;
    }> = [];

    for (const character of characters) {
      const lines = extractCharacterEventLines(content, character.name, 3);
      for (const line of lines) {
        events.push({
          novelId,
          characterId: character.id,
          chapterId,
          chapterOrder: chapter.order,
          title: `${chapter.order}"· ${chapter.title}`,
          content: line,
          source: "chapter_extract",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.characterTimeline.deleteMany({
        where: {
          novelId,
          chapterId,
          source: "chapter_extract",
        },
      });
      if (events.length > 0) {
        await tx.characterTimeline.createMany({ data: events });
      }
    });
    const timelines = await prisma.characterTimeline.findMany({
      where: {
        novelId,
        chapterId,
        source: "chapter_extract",
      },
      select: { id: true },
    });
    for (const timeline of timelines) {
      this.queueRagUpsert("character_timeline", timeline.id);
    }
  }

  private async reviewChapterContent(
    novelTitle: string,
    chapterTitle: string,
    content: string,
    options: ReviewOptions = {},
    novelId?: string,
  ): Promise<{ score: QualityScore; issues: ReviewIssue[] }> {
    if (!content.trim()) {
      return {
        score: normalizeScore({}),
        issues: [{
          severity: "critical",
          category: "coherence",
          evidence: "章节内容为空",
          fixSuggestion: "先生成或补充正文，再进行审校",
        }],
      };
    }
    try {    const llm = await getLLM(options.provider ?? "deepseek", {
        model: options.model,
        temperature: options.temperature ?? 0.1,
      });
      let ragContext = "";
      if (novelId) {
        try {
          ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
            `章节审校 ${novelTitle}\n${chapterTitle}\n${content.slice(0, 1500)}`,
            {
              novelId,
              ownerTypes: ["novel", "chapter", "chapter_summary", "consistency_fact", "character", "bible"],
              finalTopK: 6,
            },
          );
        } catch {
          ragContext = "";
        }
      }
      const result = await llm.invoke([
        new SystemMessage(
          "你是网文审校专家。请输出 JSON：{\"score\":{\"coherence\":0-100,\"repetition\":0-100,\"pacing\":0-100,\"voice\":0-100,\"engagement\":0-100,\"overall\":0-100},\"issues\":[{\"severity\":\"low|medium|high|critical\",\"category\":\"coherence|repetition|pacing|voice|engagement|logic\",\"evidence\":\"...\",\"fixSuggestion\":\"...\"}]}",
        ),
        new HumanMessage(
          `小说${novelTitle}
章节${chapterTitle}
正文"
${content}
检索补充：
${ragContext || ""}`,
        ),
      ]);
      return parseReviewOutput(toText(result.content));
    } catch {
      return { score: ruleScore(content), issues: [] };
    }
  }

  private async createQualityReport(novelId: string, chapterId: string, score: QualityScore, issues: ReviewIssue[]) {
    await prisma.qualityReport.create({
      data: {
        novelId,
        chapterId,
        coherence: score.coherence,
        repetition: score.repetition,
        pacing: score.pacing,
        voice: score.voice,
        engagement: score.engagement,
        overall: score.overall,
        issues: issues.length > 0 ? JSON.stringify(issues) : null,
      },
    });
  }

  private parsePipelinePayload(payload: string | null | undefined): PipelinePayload {
    if (!payload?.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      return {
        provider: typeof parsed.provider === "string" ? (parsed.provider as LLMProvider) : undefined,
        model: typeof parsed.model === "string" ? parsed.model : undefined,
        temperature: typeof parsed.temperature === "number" ? parsed.temperature : undefined,
      };
    } catch {
      return {};
    }
  }

  private async ensurePipelineNotCancelled(jobId: string): Promise<void> {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        cancelRequestedAt: true,
      },
    });
    if (!job || job.status === "cancelled" || job.cancelRequestedAt) {
      throw new Error("PIPELINE_CANCELLED");
    }
  }

  private async updateJobSafe(jobId: string, data: {
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    progress?: number;
    completedCount?: number;
    retryCount?: number;
    heartbeatAt?: Date | null;
    currentStage?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    cancelRequestedAt?: Date | null;
    error?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  }) {
    try {
      await prisma.generationJob.update({
        where: { id: jobId },
        data,
      });
    } catch {
      // 后台任务状态更新失败不应影响主服务稳定"
    }
  }

  private async executePipeline(jobId: string, novelId: string, options: PipelineRunOptions) {
    const maxRetries = options.maxRetries ?? 2;
    let totalRetryCount = 0;
    const failedDetails: string[] = [];

    try {
      await this.updateJobSafe(jobId, {
        status: "running",
        startedAt: new Date(),
        heartbeatAt: new Date(),
        currentStage: "generating_chapters",
      });
      logPipelineInfo("任务开始执", {
        jobId,
        novelId,
        range: `${options.startOrder}-${options.endOrder}`,
        maxRetries,
      });

      const [novel, chapters] = await Promise.all([
        prisma.novel.findUnique({ where: { id: novelId } }),
        prisma.chapter.findMany({
          where: { novelId, order: { gte: options.startOrder, lte: options.endOrder } },
          orderBy: { order: "asc" },
        }),
      ]);
      if (!novel || chapters.length === 0) {
        throw new Error("任务执行失败：小说或章节不存在");
      }
      logPipelineInfo("任务加载完成", {
        jobId,
        novelId,
        title: novel.title,
        chapterCount: chapters.length,
      });    const llm = await getLLM(options.provider ?? "deepseek", {
        model: options.model,
        temperature: options.temperature ?? 0.8,
      });
      const continuationPack = await novelContinuationService.buildChapterContextPack(novelId);

      let completed = 0;
      for (const chapter of chapters) {
        await this.ensurePipelineNotCancelled(jobId);
        let content = chapter.content ?? "";
        let final = { score: normalizeScore({}), issues: [] as ReviewIssue[] };
        let pass = false;
        await this.updateJobSafe(jobId, {
          heartbeatAt: new Date(),
          currentStage: "generating_chapters",
          currentItemKey: chapter.id,
          currentItemLabel: chapter.title,
        });
        logPipelineInfo("开始处理章", {
          jobId,
          chapterId: chapter.id,
          order: chapter.order,
          hasDraft: Boolean(content.trim()),
        });

        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          await this.ensurePipelineNotCancelled(jobId);
          logPipelineInfo("章节尝试开", {
            jobId,
            order: chapter.order,
            attempt,
            maxRetries,
          });
          if (!content.trim()) {
            await this.updateJobSafe(jobId, {
              heartbeatAt: new Date(),
              currentStage: "generating_chapters",
              currentItemKey: chapter.id,
              currentItemLabel: chapter.title,
            });
            const context = await this.buildContextText(novelId, chapter.order);
            const openingHint = await this.buildOpeningConstraintHint(novelId, chapter.order);
            const plan = await llm.invoke([
              new SystemMessage(
                `${continuationPack.enabled ? `${continuationPack.systemRule}\n` : ""}You are a web-novel chapter planner. Provide chapter objective, conflict, hook and opening trigger. Avoid repeating previous chapter openings.`,
              ),
              new HumanMessage(
                `Novel: ${novel.title}
Chapter: ${chapter.title}
Context:
${context}

Opening anti-repeat constraints:
${openingHint}

${continuationPack.enabled ? continuationPack.humanBlock : ""}`,
              ),
            ]);
            const draft = await llm.invoke([
              new SystemMessage(
                `You are a web-novel writer. Output must be Simplified Chinese.
Write 2000-3000 Chinese characters.
Requirements:
1) Do not repeat completed events.
2) Do not copy long context sentences.
3) Must push new conflict and new information.
4) Opening 2-4 sentences must be structurally different from recent chapters.
${continuationPack.enabled ? `5) ${continuationPack.systemRule}` : ""}`.trim(),
              ),
              new HumanMessage(
                `Chapter plan:
${toText(plan.content)}
Chapter title: ${chapter.title}
Chapter context:
${context}

Opening anti-repeat constraints:
${openingHint}

${continuationPack.enabled ? continuationPack.humanBlock : ""}`,
              ),
            ]);
            content = toText(draft.content);
            logPipelineInfo("Chapter drafted", {
              jobId,
              order: chapter.order,
              attempt,
              length: content.length,
            });
          }

          const openingGuard = await this.enforceOpeningDiversity(
            novelId,
            chapter.order,
            chapter.title,
            content,
            options,
          );
          content = openingGuard.content;
          if (openingGuard.rewritten) {
            logPipelineInfo("Opening diversity rewrite applied", {
              jobId,
              order: chapter.order,
              attempt,
              maxSimilarity: Number(openingGuard.maxSimilarity.toFixed(4)),
            });
          }

          const continuationGuard = await novelContinuationService.rewriteIfTooSimilar({
            chapterTitle: chapter.title,
            content,
            continuationPack,
            provider: options.provider,
            model: options.model,
            temperature: options.temperature,
          });
          content = continuationGuard.content;
          if (continuationGuard.rewritten) {
            logPipelineInfo("Continuation anti-copy rewrite applied", {
              jobId,
              order: chapter.order,
              attempt,
              maxSimilarity: Number(continuationGuard.maxSimilarity.toFixed(4)),
            });
          }

          await prisma.chapter.update({
            where: { id: chapter.id },
            data: { content, generationState: attempt === 0 ? "drafted" : "repaired" },
          });
          await this.syncChapterArtifacts(novelId, chapter.id, content);

          await this.updateJobSafe(jobId, {
            heartbeatAt: new Date(),
            currentStage: "reviewing",
            currentItemKey: chapter.id,
            currentItemLabel: chapter.title,
          });
          final = await this.reviewChapterContent(novel.title, chapter.title, content, options, novelId);
          await prisma.chapter.update({ where: { id: chapter.id }, data: { generationState: "reviewed" } });
          logPipelineInfo("章节审校结果", {
            jobId,
            order: chapter.order,
            attempt,
            score: final.score,
            issueCount: final.issues.length,
          });

          if (isPass(final.score)) {
            pass = true;
            await prisma.chapter.update({ where: { id: chapter.id }, data: { generationState: "approved" } });
            logPipelineInfo("章节通过质量门禁", {
              jobId,
              order: chapter.order,
              attempt,
            });
            break;
          }

          if (attempt < maxRetries) {
            await this.updateJobSafe(jobId, {
              heartbeatAt: new Date(),
              currentStage: "repairing",
              currentItemKey: chapter.id,
              currentItemLabel: chapter.title,
            });
            logPipelineWarn("章节未达标，准备修复重试", {
              jobId,
              order: chapter.order,
              attempt,
              score: final.score,
              threshold: QUALITY_THRESHOLD,
            });
            const repaired = await llm.invoke([
              new SystemMessage("你是网文修文编辑，请根据问题清单修复正文"),
              new HumanMessage(
                `章节标题${chapter.title}
当前正文"
${content}
问题清单"
${JSON.stringify(final.issues, null, 2)}`,
              ),
            ]);
            content = toText(repaired.content);
            totalRetryCount += 1;
            logPipelineInfo("章节修复完成", {
              jobId,
              order: chapter.order,
              nextAttempt: attempt + 1,
              length: content.length,
            });
          }
        }

        await this.createQualityReport(novelId, chapter.id, final.score, final.issues);
        if (!pass) {
          failedDetails.push(
            `${chapter.order}"coherence=${final.score.coherence}, repetition=${final.score.repetition}, engagement=${final.score.engagement})`,
          );
          logPipelineWarn("章节最终未达标", {
            jobId,
            order: chapter.order,
            score: final.score,
          });
        }
        completed += 1;
        await this.updateJobSafe(jobId, {
          completedCount: completed,
          progress: Number((completed / chapters.length).toFixed(4)),
          retryCount: totalRetryCount,
          heartbeatAt: new Date(),
        });
        logPipelineInfo("任务进度更新", {
          jobId,
          completed,
          total: chapters.length,
          progress: Number((completed / chapters.length).toFixed(4)),
          retryCount: totalRetryCount,
        });
      }

      await this.updateJobSafe(jobId, {
        status: failedDetails.length === 0 ? "succeeded" : "failed",
        error: failedDetails.length === 0 ? null : `以下章节未达标：${failedDetails.join("")}`,
        heartbeatAt: null,
        currentStage: null,
        currentItemKey: null,
        currentItemLabel: null,
        cancelRequestedAt: null,
        finishedAt: new Date(),
      });
      logPipelineInfo("任务执行结束", {
        jobId,
        status: failedDetails.length === 0 ? "succeeded" : "failed",
        failedDetails,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "PIPELINE_CANCELLED") {
        await this.updateJobSafe(jobId, {
          status: "cancelled",
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
          finishedAt: new Date(),
        });
        return;
      }
      await this.updateJobSafe(jobId, {
        status: "failed",
        error: error instanceof Error ? error.message : "流水线执行失败",
        finishedAt: new Date(),
      });
      logPipelineError("任务执行异常", {
        jobId,
        novelId,
        message: error instanceof Error ? error.message : "流水线执行失败",
      });
    }
  }
}



