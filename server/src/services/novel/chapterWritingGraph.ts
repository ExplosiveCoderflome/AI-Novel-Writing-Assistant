import { AIMessageChunk, type BaseMessageChunk } from "@langchain/core/messages";
import type {
  GenerationContextPackage,
  RuntimeLengthControl,
  RuntimeSceneGenerationResult,
} from "@ai-novel/shared/types/chapterRuntime";
import type { ChapterSceneCard } from "@ai-novel/shared/types/chapterLengthControl";
import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "../../llm/modelRouter";
import { runTextPrompt } from "../../prompting/core/promptRunner";
import {
  buildChapterRepairContextBlocks,
  withChapterRepairContext,
} from "../../prompting/prompts/novel/chapterLayeredContext";
import { chapterRepairPrompt } from "../../prompting/prompts/novel/review.prompts";
import { NovelContinuationService } from "./NovelContinuationService";
import { buildChapterSceneWriterBlocks, createChapterSceneStream } from "./chapterSceneStreaming";
import { chapterWriterPrompt } from "../../prompting/prompts/novel/chapterWriter.prompts";
import {
  buildLengthIssue,
  buildRepairBibleFallback,
  buildTailContent,
  countChapterCharacters,
  joinSceneContents,
  markTailCompression,
} from "./chapterWritingGraphShared";

export interface ChapterGraphLLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  taskType?: TaskType;
}

export interface ChapterGraphGenerateOptions extends ChapterGraphLLMOptions {
  previousChaptersSummary?: string[];
}

interface ChapterRef {
  id: string;
  title: string;
  order: number;
  content?: string | null;
  expectation?: string | null;
  targetWordCount?: number | null;
}

type ContinuationPack = Awaited<ReturnType<NovelContinuationService["buildChapterContextPack"]>>;

interface ChapterGraphDeps {
  enforceOpeningDiversity: (
    novelId: string,
    chapterOrder: number,
    chapterTitle: string,
    content: string,
    options: ChapterGraphLLMOptions,
  ) => Promise<{ content: string; rewritten: boolean; maxSimilarity: number }>;
  saveDraftAndArtifacts: (
    novelId: string,
    chapterId: string,
    content: string,
    generationState: "drafted" | "repaired",
  ) => Promise<void>;
  logInfo: (message: string, meta?: Record<string, unknown>) => void;
  logWarn: (message: string, meta?: Record<string, unknown>) => void;
}

export interface ChapterStreamInput {
  novelId: string;
  novelTitle: string;
  chapter: ChapterRef;
  contextPackage?: GenerationContextPackage;
  options: ChapterGraphGenerateOptions;
}

const continuationService = new NovelContinuationService();

export class ChapterWritingGraph {
  constructor(private readonly deps: ChapterGraphDeps) {}

  private async continuityNode(
    novelId: string,
    chapter: ChapterRef,
    content: string,
    options: ChapterGraphLLMOptions,
    continuationPack: ContinuationPack,
  ): Promise<string> {
    const openingGuard = await this.deps.enforceOpeningDiversity(
      novelId,
      chapter.order,
      chapter.title,
      content,
      options,
    );
    if (openingGuard.rewritten) {
      this.deps.logInfo("Opening diversity rewrite applied", {
        chapterOrder: chapter.order,
        maxSimilarity: Number(openingGuard.maxSimilarity.toFixed(4)),
      });
    }

    const continuationGuard = await continuationService.rewriteIfTooSimilar({
      chapterTitle: chapter.title,
      content: openingGuard.content,
      continuationPack,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
    });
    if (continuationGuard.rewritten) {
      this.deps.logInfo("Continuation anti-copy rewrite applied", {
        chapterOrder: chapter.order,
        maxSimilarity: Number(continuationGuard.maxSimilarity.toFixed(4)),
      });
    }
    return continuationGuard.content;
  }

  private async rewriteForLength(input: {
    novelTitle: string;
    chapterTitle: string;
    content: string;
    contextPackage: GenerationContextPackage;
    issues: ReviewIssue[];
    modeHint: string;
    options: ChapterGraphLLMOptions;
  }): Promise<string> {
    const repairContextPackage = withChapterRepairContext(input.contextPackage, input.issues);
    const repairContextBlocks = repairContextPackage.chapterRepairContext
      ? buildChapterRepairContextBlocks(repairContextPackage.chapterRepairContext)
      : undefined;
    const repaired = await runTextPrompt({
      asset: chapterRepairPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        bibleContent: buildRepairBibleFallback(repairContextPackage),
        chapterTitle: input.chapterTitle,
        chapterContent: input.content,
        issuesJson: JSON.stringify(input.issues, null, 2),
        ragContext: "",
        modeHint: input.modeHint,
      },
      contextBlocks: repairContextBlocks,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: Math.min(input.options.temperature ?? 0.55, 0.65),
      },
    });
    return repaired.output.trim() || input.content;
  }

  private async compressSingleScene(input: {
    novelTitle: string;
    chapter: ChapterRef;
    contextPackage: GenerationContextPackage;
    scene: ChapterSceneCard;
    sceneContent: string;
    actualWordCount: number;
    options: ChapterGraphLLMOptions;
  }): Promise<string> {
    return this.rewriteForLength({
      novelTitle: input.novelTitle,
      chapterTitle: input.chapter.title,
      content: input.sceneContent,
      contextPackage: input.contextPackage,
      issues: [
        buildLengthIssue(
          "pacing",
          "medium",
          `当前场景「${input.scene.title}」产出约 ${input.actualWordCount} 字，明显超过场景预算 ${input.scene.targetWordCount} 字。`,
          "压缩重复描述、合并低信息量反应，保留当前场景必须推进与必须保留的内容。",
        ),
      ],
      modeHint: "compress_tail_for_length：当前只压缩这个场景，保留章节既有顺序与结尾职责。",
      options: input.options,
    });
  }

  private async extendTailScene(input: {
    novelTitle: string;
    chapter: ChapterRef;
    contextPackage: GenerationContextPackage;
    content: string;
    scene: ChapterSceneCard;
    sceneIndex: number;
    sceneCount: number;
    targetWordCount: number;
    minWordCount: number;
    missingWordGap: number;
    options: ChapterGraphLLMOptions;
  }): Promise<string> {
    const writerBlocks = buildChapterSceneWriterBlocks({
      contextPackage: input.contextPackage,
      scene: input.scene,
      sceneIndex: input.sceneIndex,
      sceneCount: input.sceneCount,
      currentContent: input.content,
      remainingChapterBudget: input.missingWordGap,
    });
    if (writerBlocks.removedBlockIds.length > 0) {
      this.deps.logWarn("Writer continuation blocks removed by guard", {
        chapterOrder: input.chapter.order,
        removedBlockIds: writerBlocks.removedBlockIds,
      });
    }
    const completion = await runTextPrompt({
      asset: chapterWriterPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        chapterOrder: input.chapter.order,
        chapterTitle: input.chapter.title,
        mode: "continue",
        sceneIndex: input.sceneIndex,
        sceneCount: input.sceneCount,
        sceneTitle: input.scene.title,
        scenePurpose: input.scene.purpose,
        sceneTargetWordCount: input.scene.targetWordCount,
        chapterTargetWordCount: input.targetWordCount,
        remainingChapterBudget: input.missingWordGap,
        entryState: input.scene.entryState,
        exitState: input.scene.exitState,
        forbiddenExpansion: input.scene.forbiddenExpansion,
        targetWordCount: input.scene.targetWordCount,
        minWordCount: writerBlocks.sceneRange.minWordCount,
        maxWordCount: writerBlocks.sceneRange.maxWordCount,
        missingWordGap: input.missingWordGap,
      },
      contextBlocks: writerBlocks.allowedBlocks,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: input.options.temperature ?? 0.8,
      },
    });
    return completion.output.trim();
  }

  private async applyChapterLengthBudget(input: {
    novelId: string;
    novelTitle: string;
    chapter: ChapterRef;
    content: string;
    contextPackage: GenerationContextPackage;
    scenePlan: { scenes: ChapterSceneCard[]; lengthBudget: NonNullable<GenerationContextPackage["chapterWriteContext"]>["lengthBudget"] };
    sceneResults: RuntimeSceneGenerationResult[];
    sceneContents: string[];
    options: ChapterGraphLLMOptions;
    enforceLength?: boolean;
  }): Promise<{ content: string; lengthControl: RuntimeLengthControl }> {
    const budget = input.scenePlan.lengthBudget;
    if (!budget) {
      throw new Error("Length budget is required for chapter generation.");
    }

    const enforceLength = input.enforceLength ?? false;
    let content = input.content;
    let overlengthRepairApplied = false;
    const lengthRepairPath: string[] = [];
    const currentLength = () => countChapterCharacters(content);
    const lastScene = input.scenePlan.scenes[input.scenePlan.scenes.length - 1] ?? null;

    if (enforceLength) {
      if (lastScene && currentLength() < budget.softMinWordCount) {
        const missingWordGap = Math.max(
          budget.targetWordCount - currentLength(),
          budget.softMinWordCount - currentLength(),
        );
        const extension = await this.extendTailScene({
          novelTitle: input.novelTitle,
          chapter: input.chapter,
          contextPackage: input.contextPackage,
          content,
          scene: lastScene,
          sceneIndex: input.scenePlan.scenes.length,
          sceneCount: input.scenePlan.scenes.length,
          targetWordCount: budget.targetWordCount,
          minWordCount: budget.softMinWordCount,
          missingWordGap,
          options: input.options,
        });
        if (extension) {
          content = `${content.trim()}\n\n${extension}`.trim();
          const lastResult = input.sceneResults[input.sceneResults.length - 1];
          if (lastResult) {
            input.sceneResults[input.sceneResults.length - 1] = {
              ...lastResult,
              afterLength: countChapterCharacters(content),
              actualWordCount: lastResult.actualWordCount + countChapterCharacters(extension),
              sceneStatus: "extended_for_length",
            };
          }
          lengthRepairPath.push("extend_tail_scene");
        }
      }

      if (currentLength() > budget.softMaxWordCount && input.sceneContents.length > 0) {
        overlengthRepairApplied = true;
        const compressedLastScene = await this.rewriteForLength({
          novelTitle: input.novelTitle,
          chapterTitle: input.chapter.title,
          content: input.sceneContents[input.sceneContents.length - 1] ?? content,
          contextPackage: input.contextPackage,
          issues: [
            buildLengthIssue(
              "pacing",
              "high",
              `章节当前长度约 ${currentLength()} 字，超过软上限 ${budget.softMaxWordCount} 字。`,
              "优先压缩最后一个场景，删除低信息量描写和重复反应，保留结尾钩子。",
            ),
          ],
          modeHint: "compress_tail_for_length：优先压缩最后一个场景，不跳过结尾 hook。",
          options: input.options,
        });
        content = buildTailContent(input.sceneContents, 1, compressedLastScene);
        markTailCompression(input.sceneResults, 1, "compressed_tail_last_scene");
        lengthRepairPath.push("compress_tail_last_scene");
      }

      if (currentLength() > budget.softMaxWordCount && input.sceneContents.length > 1) {
        const tailPair = joinSceneContents(input.sceneContents.slice(-2));
        const compressedTailPair = await this.rewriteForLength({
          novelTitle: input.novelTitle,
          chapterTitle: input.chapter.title,
          content: tailPair,
          contextPackage: input.contextPackage,
          issues: [
            buildLengthIssue(
              "pacing",
              "high",
              `章节当前长度约 ${currentLength()} 字，仍超过软上限 ${budget.softMaxWordCount} 字。`,
              "继续压缩最后两个场景的低信息量段落，保住关键推进和结尾压力。",
            ),
          ],
          modeHint: "compress_tail_for_length：继续压缩最后两个场景，保持尾段因果与收束。",
          options: input.options,
        });
        content = buildTailContent(input.sceneContents, 2, compressedTailPair);
        markTailCompression(input.sceneResults, 2, "compressed_tail_last_two_scenes");
        lengthRepairPath.push("compress_tail_last_two_scenes");
      }

      if (currentLength() > budget.hardMaxWordCount) {
        const compressedChapter = await this.rewriteForLength({
          novelTitle: input.novelTitle,
          chapterTitle: input.chapter.title,
          content,
          contextPackage: input.contextPackage,
          issues: [
            buildLengthIssue(
              "pacing",
              "high",
              `章节当前长度约 ${currentLength()} 字，超过硬上限 ${budget.hardMaxWordCount} 字。`,
              "整章压缩重复描写、解释性段落和无效回合，保留章节目标、关键推进与结尾钩子。",
            ),
          ],
          modeHint: "compress_chapter_for_length：在不改动主线顺序的前提下做整章压缩。",
          options: input.options,
        });
        content = compressedChapter.trim() || content;
        markTailCompression(input.sceneResults, input.sceneResults.length, "compressed_whole_chapter");
        lengthRepairPath.push("compress_whole_chapter");
      }
    }

    const sceneModes = new Set(input.sceneResults.map((scene) => scene.wordControlMode));
    const wordControlMode = sceneModes.size === 1
      ? (input.sceneResults[0]?.wordControlMode ?? "balanced")
      : "hybrid";
    const closingPhaseTriggered = input.sceneResults.some((scene) => scene.closingPhaseTriggered);
    const hardStopsTriggered = input.sceneResults.reduce((sum, scene) => sum + scene.hardStopCount, 0);

    return {
      content,
      lengthControl: {
        targetWordCount: budget.targetWordCount,
        softMinWordCount: budget.softMinWordCount,
        softMaxWordCount: budget.softMaxWordCount,
        hardMaxWordCount: budget.hardMaxWordCount,
        finalWordCount: countChapterCharacters(content),
        variance: countChapterCharacters(content) - budget.targetWordCount,
        wordControlMode,
        plannedSceneCount: input.scenePlan.scenes.length,
        generatedSceneCount: input.sceneResults.length,
        sceneResults: input.sceneResults,
        closingPhaseTriggered,
        hardStopsTriggered,
        lengthRepairPath,
        overlengthRepairApplied,
      },
    };
  }

  async createChapterStream(input: ChapterStreamInput): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string) => Promise<{ finalContent: string; lengthControl: RuntimeLengthControl } | void>;
  }> {
    const continuationPack = (input.contextPackage?.continuation as ContinuationPack | undefined)
      ?? await continuationService.buildChapterContextPack(input.novelId);
    const chapterWriteContext = input.contextPackage?.chapterWriteContext;
    if (!input.contextPackage || !chapterWriteContext) {
      throw new Error("Chapter runtime context is required before chapter generation.");
    }
    const scenePlan = chapterWriteContext.scenePlan;
    const lengthBudget = chapterWriteContext.lengthBudget;
    const contextPackage = input.contextPackage;
    if (!scenePlan || scenePlan.scenes.length === 0 || !lengthBudget || !contextPackage) {
      throw new Error("Structured chapter scene plan is required before chapter generation.");
    }

    const sceneContents: string[] = [];
    const sceneResults: RuntimeSceneGenerationResult[] = [];
    let resolveGenerated!: (value: { content: string; sceneResults: RuntimeSceneGenerationResult[]; sceneContents: string[] }) => void;
    let rejectGenerated!: (reason?: unknown) => void;
    const generatedPromise = new Promise<{ content: string; sceneResults: RuntimeSceneGenerationResult[]; sceneContents: string[] }>((resolve, reject) => {
      resolveGenerated = resolve;
      rejectGenerated = reject;
    });
    const graph = this;

    const stream = {
      async *[Symbol.asyncIterator](): AsyncIterator<BaseMessageChunk> {
        try {
          for (let index = 0; index < scenePlan.scenes.length; index += 1) {
            const scene = scenePlan.scenes[index];
            const currentContent = joinSceneContents(sceneContents);
            if (index > 0) {
              yield new AIMessageChunk({ content: "\n\n" });
            }
            const beforeLength = countChapterCharacters(currentContent);
            const sceneStreaming = createChapterSceneStream({
              novelTitle: input.novelTitle,
              chapter: input.chapter,
              contextPackage,
              scene,
              sceneIndex: index + 1,
              sceneCount: scenePlan.scenes.length,
              chapterTargetWordCount: lengthBudget.targetWordCount,
              currentChapterContent: currentContent,
              options: input.options,
              logWarn: graph.deps.logWarn,
            });
            for await (const chunk of sceneStreaming.stream) {
              yield chunk;
            }
            const generatedScene = await sceneStreaming.complete;
            let sceneContent = generatedScene.sceneContent;
            let actualWordCount = generatedScene.actualWordCount;
            let sceneStatus = generatedScene.sceneStatus;

            sceneContents.push(sceneContent);
            sceneResults.push({
              sceneKey: scene.key,
              sceneTitle: scene.title,
              sceneIndex: index + 1,
              targetWordCount: scene.targetWordCount,
              beforeLength,
              afterLength: countChapterCharacters(joinSceneContents(sceneContents)),
              actualWordCount,
              sceneStatus,
              wordControlMode: generatedScene.wordControlMode,
              roundCount: generatedScene.roundResults.length,
              hardStopCount: generatedScene.hardStopCount,
              closingPhaseTriggered: generatedScene.closingPhaseTriggered,
              roundResults: generatedScene.roundResults,
            });
          }

          resolveGenerated({
            content: joinSceneContents(sceneContents),
            sceneResults,
            sceneContents,
          });
        } catch (error) {
          rejectGenerated(error);
          throw error;
        }
      },
    };

    return {
      stream,
      onDone: async (fullContent: string) => {
        const generated = await generatedPromise.catch(() => null);
        const rawContent = generated?.content ?? fullContent;
        const lengthAdjusted = await this.applyChapterLengthBudget({
          novelId: input.novelId,
          novelTitle: input.novelTitle,
          chapter: input.chapter,
          content: rawContent,
          contextPackage,
          scenePlan: {
            scenes: scenePlan.scenes,
            lengthBudget,
          },
          sceneResults: generated?.sceneResults ?? [],
          sceneContents: generated?.sceneContents ?? [],
          options: input.options,
          enforceLength: false,
        });
        const normalized = await this.continuityNode(
          input.novelId,
          input.chapter,
          lengthAdjusted.content,
          input.options,
          continuationPack,
        );
        const finalLengthControl: RuntimeLengthControl = {
          ...lengthAdjusted.lengthControl,
          finalWordCount: countChapterCharacters(normalized),
          variance: countChapterCharacters(normalized) - lengthAdjusted.lengthControl.targetWordCount,
        };
        await this.deps.saveDraftAndArtifacts(
          input.novelId,
          input.chapter.id,
          normalized,
          "drafted",
        );
        return {
          finalContent: normalized,
          lengthControl: finalLengthControl,
        };
      },
    };
  }
}
