import type { BaseMessageChunk } from "@langchain/core/messages";
import {
  parseChapterScenePlan,
  type ChapterScenePlan,
} from "@ai-novel/shared/types/chapterLengthControl";
import type {
  ChapterRuntimePackage,
  GenerationContextPackage,
  RuntimeLengthControl,
  RuntimeSceneGenerationResult,
} from "@ai-novel/shared/types/chapterRuntime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "../../llm/modelRouter";
import { createContextBlock } from "../../prompting/core/contextBudget";
import { runTextPrompt, streamTextPrompt } from "../../prompting/core/promptRunner";
import {
  buildChapterWriterContextBlocks,
  resolveTargetWordRange,
  sanitizeWriterContextBlocks,
} from "../../prompting/prompts/novel/chapterLayeredContext";
import { chapterWriterPrompt } from "../../prompting/prompts/novel/chapterWriter.prompts";
import { createChapterSceneStream } from "./chapterSceneStreaming";
import { NovelContinuationService } from "./NovelContinuationService";
import { joinSceneContents } from "./chapterWritingGraphShared";

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

function countChapterCharacters(content: string): number {
  return content.replace(/\s+/g, "").trim().length;
}

function buildLengthInstruction(targetWordCount?: number | null): {
  targetWordCount: number | null;
  minWordCount: number | null;
  maxWordCount: number | null;
  instruction: string;
} {
  const range = resolveTargetWordRange(targetWordCount);
  if (range.targetWordCount == null) {
    return {
      ...range,
      instruction: "Write a complete readable chapter with enough concrete events and scene substance; do not end abruptly or obviously too short.",
    };
  }
  return {
    ...range,
    instruction: `Write about ${range.targetWordCount} Chinese characters. Acceptable range: ${range.minWordCount}-${range.maxWordCount}. Do not end clearly below the minimum.`,
  };
}

function buildDraftContinuationBlock(content: string, targetWordCount: number, minWordCount: number): string {
  const trimmed = content.trim();
  const excerpt = trimmed.length > 1400 ? trimmed.slice(-1400) : trimmed;
  return [
    `Current saved draft length: ${countChapterCharacters(trimmed)} Chinese characters.`,
    `Target length: about ${targetWordCount} Chinese characters. Minimum acceptable length: ${minWordCount}.`,
    "Continue from the existing ending. Do not restart the chapter. Do not repeat already written events.",
    "Current draft tail (continue after this):",
    excerpt || "none",
  ].join("\n");
}

function createChunkQueue() {
  const items: BaseMessageChunk[] = [];
  const waiters: Array<{
    resolve: (value: IteratorResult<BaseMessageChunk>) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  let closed = false;
  let failure: unknown = null;

  function push(item: BaseMessageChunk): void {
    if (closed) {
      return;
    }
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve({ value: item, done: false });
      return;
    }
    items.push(item);
  }

  function end(): void {
    if (closed) {
      return;
    }
    closed = true;
    while (waiters.length > 0) {
      waiters.shift()!.resolve({ value: undefined, done: true });
    }
  }

  function fail(error: unknown): void {
    if (closed) {
      return;
    }
    closed = true;
    failure = error;
    while (waiters.length > 0) {
      waiters.shift()!.reject(error);
    }
  }

  return {
    stream: {
      async *[Symbol.asyncIterator](): AsyncIterator<BaseMessageChunk> {
        while (true) {
          if (items.length > 0) {
            yield items.shift()!;
            continue;
          }
          if (closed) {
            if (failure) {
              throw failure;
            }
            return;
          }
          const next = await new Promise<IteratorResult<BaseMessageChunk>>((resolve, reject) => {
            waiters.push({ resolve, reject });
          });
          if (next.done) {
            if (failure) {
              throw failure;
            }
            return;
          }
          yield next.value;
        }
      },
    },
    push,
    end,
    fail,
  };
}

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

  private async enforceTargetLength(input: {
    novelId: string;
    novelTitle: string;
    chapter: ChapterRef;
    content: string;
    contextPackage: GenerationContextPackage;
    options: ChapterGraphLLMOptions;
  }): Promise<string> {
    const writeContext = input.contextPackage.chapterWriteContext;
    const lengthGoal = buildLengthInstruction(
      writeContext?.chapterMission.targetWordCount
      ?? input.contextPackage.chapter.targetWordCount
      ?? input.chapter.targetWordCount
      ?? null,
    );
    if (!writeContext || lengthGoal.targetWordCount == null || lengthGoal.minWordCount == null) {
      return input.content;
    }

    const currentLength = countChapterCharacters(input.content);
    if (currentLength >= lengthGoal.minWordCount) {
      return input.content;
    }

    const missingWordGap = Math.max(
      lengthGoal.targetWordCount - currentLength,
      lengthGoal.minWordCount - currentLength,
    );
    const builtBlocks = buildChapterWriterContextBlocks(writeContext);
    const sanitized = sanitizeWriterContextBlocks([
      createContextBlock({
        id: "current_draft_excerpt",
        group: "current_draft_excerpt",
        priority: 99,
        required: true,
        content: buildDraftContinuationBlock(
          input.content,
          lengthGoal.targetWordCount,
          lengthGoal.minWordCount,
        ),
      }),
      ...builtBlocks,
    ]);
    if (sanitized.removedBlockIds.length > 0) {
      this.deps.logWarn("Writer continuation blocks removed by guard", {
        chapterOrder: input.chapter.order,
        removedBlockIds: sanitized.removedBlockIds,
      });
    }

    const completion = await runTextPrompt({
      asset: chapterWriterPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        chapterOrder: input.chapter.order,
        chapterTitle: input.chapter.title,
        mode: "continue",
        targetWordCount: lengthGoal.targetWordCount,
        minWordCount: lengthGoal.minWordCount,
        maxWordCount: lengthGoal.maxWordCount,
        missingWordGap,
      },
      contextBlocks: sanitized.allowedBlocks,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: input.options.temperature ?? 0.8,
      },
    });
    const appended = completion.output.trim();
    if (!appended) {
      return input.content;
    }

    const merged = `${input.content.trim()}\n\n${appended}`.trim();
    this.deps.logInfo("Chapter draft auto-extended for target length", {
      chapterOrder: input.chapter.order,
      beforeLength: currentLength,
      afterLength: countChapterCharacters(merged),
      targetWordCount: lengthGoal.targetWordCount,
      minWordCount: lengthGoal.minWordCount,
    });
    return merged;
  }

  private resolveScenePlan(input: {
    chapter: ChapterRef;
    contextPackage: GenerationContextPackage;
  }): ChapterScenePlan | null {
    return parseChapterScenePlan(input.contextPackage.chapter.sceneCards, {
      targetWordCount: input.contextPackage.chapter.targetWordCount
        ?? input.chapter.targetWordCount
        ?? input.contextPackage.chapterWriteContext?.chapterMission.targetWordCount
        ?? null,
    });
  }

  private buildSceneLengthControl(input: {
    scenePlan: ChapterScenePlan;
    content: string;
    sceneResults: RuntimeSceneGenerationResult[];
  }): RuntimeLengthControl {
    const modeSet = new Set(input.sceneResults.map((scene) => scene.wordControlMode));
    const resolvedMode = modeSet.size === 0
      ? "prompt_only"
      : modeSet.size === 1
        ? input.sceneResults[0]!.wordControlMode
        : "hybrid";
    const finalWordCount = countChapterCharacters(input.content);
    return {
      targetWordCount: input.scenePlan.lengthBudget.targetWordCount,
      softMinWordCount: input.scenePlan.lengthBudget.softMinWordCount,
      softMaxWordCount: input.scenePlan.lengthBudget.softMaxWordCount,
      hardMaxWordCount: input.scenePlan.lengthBudget.hardMaxWordCount,
      finalWordCount,
      variance: finalWordCount - input.scenePlan.lengthBudget.targetWordCount,
      wordControlMode: resolvedMode,
      plannedSceneCount: input.scenePlan.scenes.length,
      generatedSceneCount: input.sceneResults.filter((scene) => scene.actualWordCount > 0).length,
      sceneResults: input.sceneResults,
      closingPhaseTriggered: input.sceneResults.some((scene) => scene.closingPhaseTriggered),
      hardStopsTriggered: input.sceneResults.reduce((sum, scene) => sum + scene.hardStopCount, 0),
      lengthRepairPath: ["scene_contract_generation"],
      overlengthRepairApplied: false,
    };
  }

  private createSceneChapterStream(input: {
    novelTitle: string;
    chapter: ChapterRef;
    contextPackage: GenerationContextPackage;
    options: ChapterGraphGenerateOptions;
    scenePlan: ChapterScenePlan;
  }): {
    stream: AsyncIterable<BaseMessageChunk>;
    complete: Promise<{ content: string; lengthControl: RuntimeLengthControl }>;
  } {
    const queue = createChunkQueue();
    const complete = new Promise<{ content: string; lengthControl: RuntimeLengthControl }>((resolve, reject) => {
      void (async () => {
        try {
          const sceneContents: string[] = [];
          const sceneResults: RuntimeSceneGenerationResult[] = [];
          for (let index = 0; index < input.scenePlan.scenes.length; index += 1) {
            const scene = input.scenePlan.scenes[index]!;
            const beforeLength = countChapterCharacters(joinSceneContents(sceneContents));
            const sceneStream = createChapterSceneStream({
              novelTitle: input.novelTitle,
              chapter: input.chapter,
              contextPackage: input.contextPackage,
              scene,
              sceneIndex: index + 1,
              sceneCount: input.scenePlan.scenes.length,
              chapterTargetWordCount: input.scenePlan.targetWordCount,
              currentChapterContent: joinSceneContents(sceneContents),
              options: input.options,
              logWarn: this.deps.logWarn,
            });
            for await (const chunk of sceneStream.stream) {
              queue.push(chunk);
            }
            const sceneOutput = await sceneStream.complete;
            if (sceneOutput.sceneContent.trim()) {
              sceneContents.push(sceneOutput.sceneContent);
            }
            const afterLength = countChapterCharacters(joinSceneContents(sceneContents));
            sceneResults.push({
              sceneKey: scene.key,
              sceneTitle: scene.title,
              sceneIndex: index + 1,
              targetWordCount: scene.targetWordCount,
              beforeLength,
              afterLength,
              actualWordCount: sceneOutput.actualWordCount,
              sceneStatus: sceneOutput.sceneStatus,
              wordControlMode: sceneOutput.wordControlMode,
              roundCount: sceneOutput.roundResults.length,
              hardStopCount: sceneOutput.hardStopCount,
              closingPhaseTriggered: sceneOutput.closingPhaseTriggered,
              roundResults: sceneOutput.roundResults,
            });
          }

          const content = joinSceneContents(sceneContents);
          resolve({
            content,
            lengthControl: this.buildSceneLengthControl({
              scenePlan: input.scenePlan,
              content,
              sceneResults,
            }),
          });
          queue.end();
        } catch (error) {
          reject(error);
          queue.fail(error);
        }
      })();
    });
    return {
      stream: queue.stream,
      complete,
    };
  }

  async createChapterStream(input: ChapterStreamInput): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string) => Promise<{ finalContent: string; lengthControl?: ChapterRuntimePackage["lengthControl"] } | void>;
  }> {
    const continuationPack = (input.contextPackage?.continuation as ContinuationPack | undefined)
      ?? await continuationService.buildChapterContextPack(input.novelId);
    const chapterWriteContext = input.contextPackage?.chapterWriteContext;
    if (!input.contextPackage || !chapterWriteContext) {
      throw new Error("Chapter runtime context is required before chapter generation.");
    }
    const contextPackage = input.contextPackage;
    // Scene-driven generation is currently disabled. Even if sceneCards exist,
    // chapter writing should run as a single whole-chapter pass.

    const targetRange = resolveTargetWordRange(chapterWriteContext.chapterMission.targetWordCount);
    const builtBlocks = buildChapterWriterContextBlocks(chapterWriteContext);
    const sanitized = sanitizeWriterContextBlocks(builtBlocks);
    if (sanitized.removedBlockIds.length > 0) {
      this.deps.logWarn("Writer context blocks removed by guard", {
        chapterOrder: input.chapter.order,
        removedBlockIds: sanitized.removedBlockIds,
      });
    }

    const streamed = await streamTextPrompt({
      asset: chapterWriterPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        chapterOrder: input.chapter.order,
        chapterTitle: input.chapter.title,
        mode: "draft",
        targetWordCount: chapterWriteContext.chapterMission.targetWordCount ?? null,
        minWordCount: targetRange.minWordCount,
        maxWordCount: targetRange.maxWordCount,
      },
      contextBlocks: sanitized.allowedBlocks,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: input.options.temperature ?? 0.8,
        maxTokens: undefined,
      },
    });

    return {
      stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const completed = await streamed.complete.catch(() => null);
        const rawContent = completed?.output ?? fullContent;
        const normalized = await this.continuityNode(
          input.novelId,
          input.chapter,
          rawContent,
          input.options,
          continuationPack,
        );
        const lengthAdjusted = await this.enforceTargetLength({
          novelId: input.novelId,
          novelTitle: input.novelTitle,
          chapter: input.chapter,
          content: normalized,
          contextPackage,
          options: input.options,
        });
        await this.deps.saveDraftAndArtifacts(
          input.novelId,
          input.chapter.id,
          lengthAdjusted,
          "drafted",
        );
        return { finalContent: lengthAdjusted };
      },
    };
  }
}
