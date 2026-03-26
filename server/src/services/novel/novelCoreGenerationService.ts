import type { BaseMessageChunk } from "@langchain/core/messages";
import { prisma } from "../../db/prisma";
import {
  runStructuredPrompt,
  streamStructuredPrompt,
  streamTextPrompt,
} from "../../prompting/core/promptRunner";
import {
  novelBeatPrompt,
  novelBiblePrompt,
  novelChapterHookPrompt,
  novelOutlinePrompt,
  novelStructuredOutlinePrompt,
} from "../../prompting/prompts/novel/coreGeneration.prompts";
import { novelReferenceService } from "./NovelReferenceService";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";
import {
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
  GenerateBeatOptions,
  HookGenerateOptions,
  LLMGenerateOptions,
  normalizeBeatOrder,
  normalizeBeatStatus,
  OutlineGenerateOptions,
  StructuredOutlineGenerateOptions,
  TitleGenerateOptions,
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
    const charactersText = novel.characters.length > 0
      ? novel.characters
        .map((character) => `- ${character.name}（${character.role}）${character.personality ? `：${character.personality.slice(0, 80)}` : ""}`)
        .join("\n")
      : "暂无";
    const initialPrompt = options.initialPrompt?.trim() ?? "";
    const streamed = await streamTextPrompt({
      asset: novelOutlinePrompt,
      promptInput: {
        title: novel.title,
        description: novel.description ?? "",
        charactersText,
        worldContext,
        referenceContext: referenceContext.trim() || undefined,
        initialPrompt: initialPrompt || undefined,
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: options.temperature ?? 0.7,
      },
    });

    return {
      stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const completed = await streamed.complete;
        await prisma.novel.update({
          where: { id: novelId },
          data: { outline: completed.output.trim() || fullContent },
        });
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
    const charactersText = novel.characters.length > 0
      ? novel.characters
        .map((character) => `- ${character.name}（${character.role}）${character.personality ? `：${character.personality.slice(0, 80)}` : ""}`)
        .join("\n")
      : "暂无";
    const totalChapters = options.totalChapters
      ?? novel.estimatedChapterCount
      ?? DEFAULT_ESTIMATED_CHAPTER_COUNT;

    const streamed = await streamStructuredPrompt({
      asset: novelStructuredOutlinePrompt,
      promptInput: {
        charactersText,
        worldContext,
        outline: novel.outline,
        referenceContext: referenceContext.trim() || undefined,
        totalChapters,
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: options.temperature ?? 0.2,
      },
    });

    return {
      stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (_fullContent: string) => {
        const completed = await streamed.complete;
        const normalized = completed.output;
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
    const streamed = await streamStructuredPrompt({
      asset: novelBiblePrompt,
      promptInput: {
        title: novel.title,
        genreName: novel.genre?.name ?? "未分类",
        description: novel.description ?? "",
        charactersText: novel.characters.map((item) => `${item.name}（${item.role}）`).join("、") || "暂无",
        worldContext,
        referenceContext: referenceContext.trim() || undefined,
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: options.temperature ?? 0.6,
      },
    });

    return {
      stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (_fullContent: string) => {
        const completed = await streamed.complete;
        const persisted = normalizeNovelBiblePayload(completed.output as Record<string, unknown>, novel.title);
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
    const targetChapters = options.targetChapters
      ?? Math.max(
        novel.estimatedChapterCount ?? DEFAULT_ESTIMATED_CHAPTER_COUNT,
        novel.chapters.length || 0,
        1,
      );

    const streamed = await streamStructuredPrompt({
      asset: novelBeatPrompt,
      promptInput: {
        title: novel.title,
        description: novel.description ?? "",
        worldContext,
        bibleRawContent: novel.bible?.rawContent ?? "暂无",
        targetChapters,
        referenceContext: referenceContext.trim() || undefined,
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: options.temperature ?? 0.7,
      },
    });

    return {
      stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (_fullContent: string) => {
        const completed = await streamed.complete;
        const normalizedBeats = completed.output.map((item, index) => ({
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

    const result = await runStructuredPrompt({
      asset: novelChapterHookPrompt,
      promptInput: {
        title: chapter.title,
        content: (chapter.content ?? "").slice(-1800),
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: options.temperature ?? 0.8,
      },
    });
    const payload = result.output;
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
