import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { novelReferenceService } from "./NovelReferenceService";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";
import {
  buildStructuredOutlineRepairSystemPrompt,
  buildStructuredOutlineSystemPrompt,
  parseStrictStructuredOutline,
  stringifyStructuredOutline,
  toOutlineChapterRows,
} from "./structuredOutline";
import { titleGenerationService } from "../title/TitleGenerationService";
import { NovelWorldSliceService } from "./storyWorldSlice/NovelWorldSliceService";
import { formatStoryWorldSlicePromptBlock } from "./storyWorldSlice/storyWorldSliceFormatting";
import { normalizeNovelBiblePayload } from "./novelBiblePersistence";
import {
  ChapterGenerateOptions,
  DEFAULT_ESTIMATED_CHAPTER_COUNT,
  extractJSONArray,
  extractJSONObject,
  GenerateBeatOptions,
  HookGenerateOptions,
  LLMGenerateOptions,
  normalizeBeatOrder,
  normalizeBeatStatus,
  OutlineGenerateOptions,
  StructuredOutlineGenerateOptions,
  TitleGenerateOptions,
  toText,
  briefSummary,
} from "./novelCoreShared";
import { buildWorldContextFromNovel, ensureNovelCharacters, queueRagUpsert } from "./novelCoreSupport";

export class NovelCoreGenerationService {
  private readonly storyWorldSliceService = new NovelWorldSliceService();
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();

  async createOutlineStream(novelId: string, options: OutlineGenerateOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { world: true, characters: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }

    const [storyWorldSlice, referenceContext] = await Promise.all([
      this.storyWorldSliceService.ensureStoryWorldSlice(novelId, {
        storyInput: options.initialPrompt?.trim() || novel.description || "",
        builderMode: "outline",
      }),
      novelReferenceService.buildReferenceForStage(novelId, "outline"),
    ]);

    const worldContext = storyWorldSlice
      ? formatStoryWorldSlicePromptBlock(storyWorldSlice)
      : buildWorldContextFromNovel(novel);
    const referenceBlock = referenceContext.trim()
      ? `\n\n参考资料（来自已有作品拆书分析，可借鉴但不必照搬）：\n${referenceContext}`
      : "";
    const charactersText = novel.characters.length > 0
      ? novel.characters
        .map((character) => `- ${character.name}（${character.role}）${character.personality ? `：${character.personality.slice(0, 80)}` : ""}`)
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
        queueRagUpsert("novel", novelId);
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

    await ensureNovelCharacters(novelId, "生成结构化大纲");
    if (!novel.outline) {
      throw new Error("请先生成小说发展走向");
    }

    const [storyWorldSlice, referenceContext] = await Promise.all([
      this.storyWorldSliceService.ensureStoryWorldSlice(novelId, {
        storyInput: novel.outline ?? novel.description ?? "",
        builderMode: "structured_outline",
      }),
      novelReferenceService.buildReferenceForStage(novelId, "structured_outline"),
    ]);

    const worldContext = storyWorldSlice
      ? formatStoryWorldSlicePromptBlock(storyWorldSlice)
      : buildWorldContextFromNovel(novel);
    const referenceBlock = referenceContext.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${referenceContext}`
      : "";
    const charactersText = novel.characters.length > 0
      ? novel.characters
        .map((character) => `- ${character.name}（${character.role}）${character.personality ? `：${character.personality.slice(0, 80)}` : ""}`)
        .join("\n")
      : "暂无";
    const totalChapters = options.totalChapters
      ?? novel.estimatedChapterCount
      ?? DEFAULT_ESTIMATED_CHAPTER_COUNT;

    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.2,
    });
    const stream = await llm.stream([
      new SystemMessage(buildStructuredOutlineSystemPrompt(totalChapters)),
      new HumanMessage(
        `核心角色（必须使用这些角色，不得替换或忽略）：
${charactersText}
世界上下文：
${worldContext}
基于下述发展走向，生成 ${totalChapters} 章规划：
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
        queueRagUpsert("novel", novelId);
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
    const existingByOrder = new Map(existing.map((chapter) => [chapter.order, chapter.id]));

    await Promise.all(
      chapters.map((chapter) => {
        const existingId = existingByOrder.get(chapter.order);
        if (existingId) {
          return prisma.chapter.update({
            where: { id: existingId },
            data: { title: chapter.title, expectation: chapter.summary },
          });
        }
        return prisma.chapter.create({
          data: {
            novelId,
            title: chapter.title,
            order: chapter.order,
            content: "",
            expectation: chapter.summary,
            generationState: "planned",
          },
        });
      }),
    );
  }

  async createChapterStream(novelId: string, chapterId: string, options: ChapterGenerateOptions = {}) {
    return this.chapterRuntimeCoordinator.createChapterStream(novelId, chapterId, options, {
      includeRuntimePackage: false,
    });
  }

  async generateTitles(novelId: string, options: TitleGenerateOptions = {}) {
    return titleGenerationService.generateNovelTitles(novelId, options);
  }

  async createBibleStream(novelId: string, options: LLMGenerateOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: { characters: true, genre: true, world: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }

    await ensureNovelCharacters(novelId, "生成作品圣经");
    const [storyWorldSlice, referenceContext] = await Promise.all([
      this.storyWorldSliceService.ensureStoryWorldSlice(novelId, {
        storyInput: novel.outline ?? novel.description ?? "",
        builderMode: "bible",
      }),
      novelReferenceService.buildReferenceForStage(novelId, "bible"),
    ]);

    const worldContext = storyWorldSlice
      ? formatStoryWorldSlicePromptBlock(storyWorldSlice)
      : buildWorldContextFromNovel(novel);
    const referenceBlock = referenceContext.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${referenceContext}`
      : "";

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
  "characterArcs":"核心角色成长",
  "worldRules":"世界运行规则"
}
仅输出 JSON。`,
      ),
      new HumanMessage(
        `小说标题：${novel.title}
类型：${novel.genre?.name ?? "未分类"}
简介：${novel.description ?? ""}
角色：${novel.characters.map((item) => `${item.name}（${item.role}）`).join("、") || "暂无"}
世界上下文：
${worldContext}${referenceBlock}`,
      ),
    ]);

    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const parsed = JSON.parse(extractJSONObject(fullContent)) as Record<string, unknown>;
        const persisted = normalizeNovelBiblePayload(parsed, novel.title);
        await prisma.novelBible.upsert({
          where: { novelId },
          update: {
            coreSetting: persisted.coreSetting,
            forbiddenRules: persisted.forbiddenRules,
            mainPromise: persisted.mainPromise,
            characterArcs: persisted.characterArcs,
            worldRules: persisted.worldRules,
            rawContent: persisted.rawContent,
          },
          create: {
            novelId,
            coreSetting: persisted.coreSetting,
            forbiddenRules: persisted.forbiddenRules,
            mainPromise: persisted.mainPromise,
            characterArcs: persisted.characterArcs,
            worldRules: persisted.worldRules,
            rawContent: persisted.rawContent,
          },
        });
        queueRagUpsert("bible", novelId);
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

    await ensureNovelCharacters(novelId, "生成剧情拍点");
    const [storyWorldSlice, referenceContext] = await Promise.all([
      this.storyWorldSliceService.ensureStoryWorldSlice(novelId, {
        storyInput: novel.outline ?? novel.description ?? "",
        builderMode: "beats",
      }),
      novelReferenceService.buildReferenceForStage(novelId, "beats"),
    ]);

    const worldContext = storyWorldSlice
      ? formatStoryWorldSlicePromptBlock(storyWorldSlice)
      : buildWorldContextFromNovel(novel);
    const referenceBlock = referenceContext.trim()
      ? `\n\n参考资料（来自已有作品拆书分析）：\n${referenceContext}`
      : "";
    const targetChapters = options.targetChapters
      ?? Math.max(
        novel.estimatedChapterCount ?? DEFAULT_ESTIMATED_CHAPTER_COUNT,
        novel.chapters.length || 0,
        1,
      );

    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.7,
    });
    const stream = await llm.stream([
      new SystemMessage(
        "你是网文剧情策划，请输出 JSON 数组，每项字段：chapterOrder/beatType/title/content/status",
      ),
      new HumanMessage(
        `小说标题：${novel.title}
小说简介：${novel.description ?? ""}
世界上下文：${worldContext}
作品圣经：${novel.bible?.rawContent ?? "暂无"}
目标章节：${targetChapters}${referenceBlock}`,
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
            await tx.plotBeat.createMany({ data: normalizedBeats });
          }
        });
      },
    };
  }

  async generateChapterHook(novelId: string, options: HookGenerateOptions = {}) {
    const chapter = options.chapterId
      ? await prisma.chapter.findFirst({ where: { id: options.chapterId, novelId } })
      : await prisma.chapter.findFirst({ where: { novelId }, orderBy: { order: "desc" } });
    if (!chapter) {
      throw new Error("未找到可生成钩子的章节");
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

    queueRagUpsert("chapter", chapter.id);
    queueRagUpsert("chapter_summary", chapter.id);
    return { chapterId: chapter.id, hook, nextExpectation: expectation };
  }
}
