import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";

interface PaginationInput {
  page: number;
  limit: number;
}

interface CreateNovelInput {
  title: string;
  description?: string;
  genreId?: string;
}

interface UpdateNovelInput {
  title?: string;
  description?: string;
  status?: "draft" | "published";
  genreId?: string | null;
  outline?: string | null;
  structuredOutline?: string | null;
}

interface ChapterInput {
  title: string;
  order: number;
  content?: string;
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
  provider?: "deepseek" | "siliconflow" | "openai" | "anthropic";
  model?: string;
  temperature?: number;
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
    throw new Error("未检测到有效 JSON 对象。");
  }
  return text.slice(first, last + 1);
}

function extractJSONArray(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("未检测到有效 JSON 数组。");
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

function isPass(score: QualityScore): boolean {
  return score.coherence >= QUALITY_THRESHOLD.coherence
    && score.repetition <= QUALITY_THRESHOLD.repetition
    && score.engagement >= QUALITY_THRESHOLD.engagement;
}

function briefSummary(content: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length <= 260 ? text : `${text.slice(0, 260)}...`;
}

function extractFacts(content: string): Array<{ category: "plot" | "character" | "world"; content: string }> {
  const lines = content.split(/[\n。！？!?]/).map((item) => item.trim()).filter((item) => item.length >= 8).slice(0, 6);
  return lines.map((line) => {
    if (/世界|地理|宗门|王朝|大陆|规则/.test(line)) {
      return { category: "world" as const, content: line };
    }
    if (/主角|反派|角色|他|她/.test(line)) {
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
    .split(/[\n。！？!?]/)
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
  if (value === "completed" || value === "已完成" || value === "finish" || value === "done") {
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

export class NovelService {
  async listNovels({ page, limit }: PaginationInput) {
    const [items, total] = await Promise.all([
      prisma.novel.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: "desc" },
        include: {
          genre: true,
          bible: true,
          _count: { select: { chapters: true, characters: true, plotBeats: true } },
        },
      }),
      prisma.novel.count(),
    ]);

    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async createNovel(input: CreateNovelInput) {
    return prisma.novel.create({
      data: { title: input.title, description: input.description, genreId: input.genreId },
    });
  }

  async getNovelById(id: string) {
    return prisma.novel.findUnique({
      where: { id },
      include: {
        genre: true,
        bible: true,
        chapters: { orderBy: { order: "asc" }, include: { chapterSummary: true } },
        characters: { orderBy: { createdAt: "asc" } },
        plotBeats: { orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
  }

  async updateNovel(id: string, input: UpdateNovelInput) {
    return prisma.novel.update({ where: { id }, data: input });
  }

  async deleteNovel(id: string) {
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
        generationState: "planned",
      },
    });
    if (chapter.content) {
      await this.syncChapterArtifacts(novelId, chapter.id, chapter.content);
    }
    return chapter;
  }

  async updateChapter(novelId: string, chapterId: string, input: Partial<ChapterInput>) {
    const exists = await prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { id: true } });
    if (!exists) {
      throw new Error("章节不存在。");
    }
    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: { title: input.title, order: input.order, content: input.content },
    });
    if (typeof input.content === "string") {
      await this.syncChapterArtifacts(novelId, chapterId, input.content);
    }
    return chapter;
  }

  async deleteChapter(novelId: string, chapterId: string) {
    const deleted = await prisma.chapter.deleteMany({ where: { id: chapterId, novelId } });
    if (deleted.count === 0) {
      throw new Error("章节不存在。");
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
        throw new Error("基础角色不存在。");
      }
      payload = {
        ...payload,
        personality: input.personality ?? baseCharacter.personality,
        background: input.background ?? baseCharacter.background,
        development: input.development ?? baseCharacter.development,
      };
    }
    return prisma.character.create({ data: { novelId, ...payload } });
  }

  async updateCharacter(novelId: string, characterId: string, input: Partial<CharacterInput>) {
    const exists = await prisma.character.findFirst({
      where: { id: characterId, novelId },
      select: { id: true, currentState: true, currentGoal: true },
    });
    if (!exists) {
      throw new Error("角色不存在。");
    }
    const hasStateChanged = typeof input.currentState === "string" && input.currentState !== exists.currentState;
    const hasGoalChanged = typeof input.currentGoal === "string" && input.currentGoal !== exists.currentGoal;
    return prisma.character.update({
      where: { id: characterId },
      data: {
        ...input,
        ...(hasStateChanged || hasGoalChanged ? { lastEvolvedAt: new Date() } : {}),
      },
    });
  }

  async deleteCharacter(novelId: string, characterId: string) {
    const deleted = await prisma.character.deleteMany({ where: { id: characterId, novelId } });
    if (deleted.count === 0) {
      throw new Error("角色不存在。");
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
      throw new Error("角色不存在。");
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
          title: `第${chapter.order}章 · ${chapter.title}`,
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
      throw new Error("小说或角色不存在。");
    }

    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.4,
    });

    const timelineText = timelines.length > 0
      ? timelines
        .map((item) => `${item.title}: ${item.content}`)
        .join("\n")
      : "暂无时间线事件。";

    const result = await llm.invoke([
      new SystemMessage(
        `你是小说角色发展编辑。请基于角色经历输出 JSON：
{
  "personality":"更新后的性格",
  "background":"更新后的背景信息（可选）",
  "development":"更新后的成长轨迹",
  "currentState":"角色当前状态",
  "currentGoal":"角色当前目标"
}
仅输出 JSON。`,
      ),
      new HumanMessage(
        `小说：${novel.title}
作品圣经：${novel.bible?.rawContent ?? "暂无"}
角色：${character.name}(${character.role})
现有设定：
personality=${character.personality ?? "暂无"}
background=${character.background ?? "暂无"}
development=${character.development ?? "暂无"}
currentState=${character.currentState ?? "暂无"}
currentGoal=${character.currentGoal ?? "暂无"}

时间线事件：
${timelineText}`,
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

  async createOutlineStream(novelId: string, options: LLMGenerateOptions = {}) {
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.7,
    });
    const stream = await llm.stream([
      new SystemMessage("你是一位专业的小说发展走向策划师，请输出完整发展走向。"),
      new HumanMessage(`小说标题：${novel.title}\n小说简介：${novel.description ?? "无"}`),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        await prisma.novel.update({ where: { id: novelId }, data: { outline: fullContent } });
      },
    };
  }

  async createStructuredOutlineStream(novelId: string, options: StructuredOutlineGenerateOptions = {}) {
    const novel = await prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    await this.ensureNovelCharacters(novelId, "生成结构化大纲");
    if (!novel.outline) {
      throw new Error("请先生成小说发展走向。");
    }
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.5,
    });
    const stream = await llm.stream([
      new SystemMessage("你是一位专业的小说结构化编剧，请严格输出 JSON 数组。"),
      new HumanMessage(`基于下述发展走向，生成${options.totalChapters ?? 20}章规划：\n${novel.outline}`),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const jsonText = extractJSONArray(fullContent);
        JSON.parse(jsonText);
        await prisma.novel.update({ where: { id: novelId }, data: { structuredOutline: jsonText } });
      },
    };
  }

  async createChapterStream(novelId: string, chapterId: string, options: ChapterGenerateOptions = {}) {
    const [novel, chapter] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId } }),
      prisma.chapter.findFirst({ where: { id: chapterId, novelId } }),
    ]);
    if (!novel || !chapter) {
      throw new Error("小说或章节不存在。");
    }
    await this.ensureNovelCharacters(novelId, "生成章节内容");
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.8,
    });
    const context = options.previousChaptersSummary?.join("\n") || (await this.buildContextText(novelId, chapter.order));
    const stream = await llm.stream([
      new SystemMessage("你是一位优秀的网文作者，请输出连贯、可读、节奏紧凑的章节正文。"),
      new HumanMessage(
        `小说：${novel.title}
章节标题：${chapter.title}
上下文：
${context}
字数要求：2000-3000字`,
      ),
    ]);
    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        await prisma.chapter.update({
          where: { id: chapterId },
          data: { content: fullContent, generationState: "drafted" },
        });
        await this.syncChapterArtifacts(novelId, chapterId, fullContent);
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
      throw new Error("小说不存在。");
    }
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.9,
    });
    const result = await llm.invoke([
      new SystemMessage(
        "你是网文标题专家，请输出 JSON：{\"titles\":[{\"title\":\"...\",\"clickRate\":85,\"style\":\"literary/conflict\"}]}",
      ),
      new HumanMessage(`小说类型：${novel.genre?.name ?? "未分类"}\n小说简介：${novel.description ?? "无"}`),
    ]);
    const parsed = JSON.parse(cleanJsonText(toText(result.content))) as {
      titles: Array<{ title: string; clickRate: number; style: "literary" | "conflict" }>;
    };
    return parsed;
  }

  async createBibleStream(novelId: string, options: LLMGenerateOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { characters: true, genre: true },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    await this.ensureNovelCharacters(novelId, "生成作品圣经");
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.6,
    });
    const stream = await llm.stream([
      new SystemMessage(
        `你是网文总编，请输出作品圣经 JSON：
{
  "coreSetting":"核心设定",
  "forbiddenRules":"禁止冲突规则",
  "mainPromise":"主线承诺",
  "characterArcs":"核心角色成长弧",
  "worldRules":"世界运行规则"
}
仅输出 JSON。`,
      ),
      new HumanMessage(
        `小说标题：${novel.title}
类型：${novel.genre?.name ?? "未分类"}
简介：${novel.description ?? "无"}
角色：${novel.characters.map((item) => `${item.name}(${item.role})`).join("、") || "暂无"}`,
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
      },
    };
  }

  async createBeatStream(novelId: string, options: GenerateBeatOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { bible: true, chapters: true },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    await this.ensureNovelCharacters(novelId, "生成剧情拍点");
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.7,
    });
    const targetChapters = options.targetChapters ?? Math.max(30, novel.chapters.length || 30);
    const stream = await llm.stream([
      new SystemMessage(
        "你是网文剧情策划，请输出 JSON 数组，每项字段：chapterOrder/beatType/title/content/status。",
      ),
      new HumanMessage(
        `小说标题：${novel.title}
小说简介：${novel.description ?? "无"}
作品圣经：${novel.bible?.rawContent ?? "暂无"}
目标章节：${targetChapters}`,
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
    await this.ensureNovelCharacters(novelId, "启动批量章节流水线");
    const chapterStats = await prisma.chapter.aggregate({
      where: { novelId },
      _min: { order: true },
      _max: { order: true },
      _count: { order: true },
    });

    if ((chapterStats._count.order ?? 0) === 0) {
      throw new Error("当前小说还没有章节，请先创建章节后再启动流水线。");
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
        `指定区间内没有可生成的章节。当前可用章节范围为第 ${minOrder} 章到第 ${maxOrder} 章。`,
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
        payload: JSON.stringify({
          provider: options.provider ?? "deepseek",
          model: options.model ?? "",
          temperature: options.temperature ?? 0.8,
        }),
      },
    });
    logPipelineInfo("批量任务已入队", {
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

  async reviewChapter(novelId: string, chapterId: string, options: ReviewOptions = {}) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      include: { novel: true },
    });
    if (!chapter) {
      throw new Error("章节不存在。");
    }
    const review = await this.reviewChapterContent(
      chapter.novel.title,
      chapter.title,
      options.content ?? chapter.content ?? "",
      options,
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
      throw new Error("小说或章节不存在。");
    }
    const issues = options.reviewIssues ?? (await this.reviewChapter(novelId, chapterId, options)).issues;
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.5,
    });
    const stream = await llm.stream([
      new SystemMessage("你是资深网文编辑，请基于审校问题修复章节，保证主线和口吻一致。"),
      new HumanMessage(
        `小说标题：${novel.title}
作品圣经：${bible?.rawContent ?? "暂无"}
章节标题：${chapter.title}
原始正文：
${chapter.content ?? "无"}
审校问题：
${JSON.stringify(issues, null, 2)}
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
      throw new Error("未找到可生成钩子的章节。");
    }
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.8,
    });
    const result = await llm.invoke([
      new SystemMessage(
        "你是网文运营编辑。请输出 JSON：{\"hook\":\"章节末钩子\",\"nextExpectation\":\"下章期待点\"}",
      ),
      new HumanMessage(`章节标题：${chapter.title}\n章节内容：\n${(chapter.content ?? "").slice(-1800)}`),
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
    return { chapterId: chapter.id, hook, nextExpectation: expectation };
  }

  private async buildContextText(novelId: string, chapterOrder: number): Promise<string> {
    const [bible, summaries, facts] = await Promise.all([
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
    ]);
    const bibleText = bible
      ? `作品圣经：
主线承诺：${bible.mainPromise ?? "无"}
核心设定：${bible.coreSetting ?? "无"}
禁止冲突：${bible.forbiddenRules ?? "无"}
角色成长弧：${bible.characterArcs ?? "无"}
世界规则：${bible.worldRules ?? "无"}`
      : "作品圣经：暂无";
    const summaryText = summaries.length > 0
      ? `最近章节摘要：\n${summaries.map((item) => `第${item.chapter.order}章：${item.summary}`).join("\n")}`
      : "最近章节摘要：暂无";
    const factText = facts.length > 0
      ? `最近关键事实：\n${facts.map((item) => `[${item.category}] ${item.content}`).join("\n")}`
      : "最近关键事实：暂无";
    return `${bibleText}\n\n${summaryText}\n\n${factText}`;
  }

  private async ensureNovelCharacters(novelId: string, actionName: string, minCount = 1) {
    const count = await prisma.character.count({ where: { novelId } });
    if (count < minCount) {
      throw new Error(`请先在本小说中至少添加 ${minCount} 个角色后再${actionName}。`);
    }
  }

  private async syncChapterArtifacts(novelId: string, chapterId: string, content: string) {
    const summary = briefSummary(content);
    const facts = extractFacts(content);
    await prisma.$transaction(async (tx) => {
      await tx.chapterSummary.upsert({
        where: { chapterId },
        update: {
          summary,
          keyEvents: facts.map((item) => item.content).slice(0, 3).join("；"),
          characterStates: facts.filter((item) => item.category === "character").map((item) => item.content).slice(0, 3).join("；"),
        },
        create: {
          novelId,
          chapterId,
          summary,
          keyEvents: facts.map((item) => item.content).slice(0, 3).join("；"),
          characterStates: facts.filter((item) => item.category === "character").map((item) => item.content).slice(0, 3).join("；"),
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
          title: `第${chapter.order}章 · ${chapter.title}`,
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
  }

  private async reviewChapterContent(
    novelTitle: string,
    chapterTitle: string,
    content: string,
    options: ReviewOptions = {},
  ): Promise<{ score: QualityScore; issues: ReviewIssue[] }> {
    if (!content.trim()) {
      return {
        score: normalizeScore({}),
        issues: [{
          severity: "critical",
          category: "coherence",
          evidence: "章节内容为空。",
          fixSuggestion: "先生成或补充正文，再进行审校。",
        }],
      };
    }
    try {
      const llm = await getLLM(options.provider ?? "deepseek", {
        model: options.model,
        temperature: options.temperature ?? 0.1,
      });
      const result = await llm.invoke([
        new SystemMessage(
          "你是网文审校专家。请输出 JSON：{\"score\":{\"coherence\":0-100,\"repetition\":0-100,\"pacing\":0-100,\"voice\":0-100,\"engagement\":0-100,\"overall\":0-100},\"issues\":[{\"severity\":\"low|medium|high|critical\",\"category\":\"coherence|repetition|pacing|voice|engagement|logic\",\"evidence\":\"...\",\"fixSuggestion\":\"...\"}]}。",
        ),
        new HumanMessage(`小说：${novelTitle}\n章节：${chapterTitle}\n正文：\n${content}`),
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

  private async updateJobSafe(jobId: string, data: {
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    progress?: number;
    completedCount?: number;
    retryCount?: number;
    error?: string | null;
    startedAt?: Date;
    finishedAt?: Date;
  }) {
    try {
      await prisma.generationJob.update({
        where: { id: jobId },
        data,
      });
    } catch {
      // 后台任务状态更新失败不应影响主服务稳定性
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
      });
      logPipelineInfo("任务开始执行", {
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
        throw new Error("任务执行失败：小说或章节不存在。");
      }
      logPipelineInfo("任务加载完成", {
        jobId,
        novelId,
        title: novel.title,
        chapterCount: chapters.length,
      });
      const llm = await getLLM(options.provider ?? "deepseek", {
        model: options.model,
        temperature: options.temperature ?? 0.8,
      });

      let completed = 0;
      for (const chapter of chapters) {
        let content = chapter.content ?? "";
        let final = { score: normalizeScore({}), issues: [] as ReviewIssue[] };
        let pass = false;
        logPipelineInfo("开始处理章节", {
          jobId,
          chapterId: chapter.id,
          order: chapter.order,
          hasDraft: Boolean(content.trim()),
        });

        for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
          logPipelineInfo("章节尝试开始", {
            jobId,
            order: chapter.order,
            attempt,
            maxRetries,
          });
          if (!content.trim()) {
            const context = await this.buildContextText(novelId, chapter.order);
            const plan = await llm.invoke([
              new SystemMessage("你是网文章节策划，请给出章目标、冲突点、钩子点。"),
              new HumanMessage(`小说：${novel.title}\n章节：${chapter.title}\n上下文：\n${context}`),
            ]);
            const draft = await llm.invoke([
              new SystemMessage("你是网文作者，请基于策划写出2000-3000字章节正文。"),
              new HumanMessage(`章节策划：\n${toText(plan.content)}\n章节标题：${chapter.title}`),
            ]);
            content = toText(draft.content);
            logPipelineInfo("章节已生成初稿", {
              jobId,
              order: chapter.order,
              attempt,
              length: content.length,
            });
          }

          await prisma.chapter.update({
            where: { id: chapter.id },
            data: { content, generationState: attempt === 0 ? "drafted" : "repaired" },
          });
          await this.syncChapterArtifacts(novelId, chapter.id, content);

          final = await this.reviewChapterContent(novel.title, chapter.title, content, options);
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
            logPipelineWarn("章节未达标，准备修复重试", {
              jobId,
              order: chapter.order,
              attempt,
              score: final.score,
              threshold: QUALITY_THRESHOLD,
            });
            const repaired = await llm.invoke([
              new SystemMessage("你是网文修文编辑，请根据问题清单修复正文。"),
              new HumanMessage(
                `章节标题：${chapter.title}
当前正文：
${content}
问题清单：
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
            `第${chapter.order}章(coherence=${final.score.coherence}, repetition=${final.score.repetition}, engagement=${final.score.engagement})`,
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
        error: failedDetails.length === 0 ? null : `以下章节未达标：${failedDetails.join("；")}`,
        finishedAt: new Date(),
      });
      logPipelineInfo("任务执行结束", {
        jobId,
        status: failedDetails.length === 0 ? "succeeded" : "failed",
        failedDetails,
      });
    } catch (error) {
      await this.updateJobSafe(jobId, {
        status: "failed",
        error: error instanceof Error ? error.message : "流水线执行失败。",
        finishedAt: new Date(),
      });
      logPipelineError("任务执行异常", {
        jobId,
        novelId,
        message: error instanceof Error ? error.message : "流水线执行失败。",
      });
    }
  }
}
