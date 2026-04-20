import { AIMessageChunk, type BaseMessageChunk } from "@langchain/core/messages";
import type {
  GenerationContextPackage,
  RuntimeSceneRoundResult,
} from "@ai-novel/shared/types/chapterRuntime";
import type { ChapterSceneCard } from "@ai-novel/shared/types/chapterLengthControl";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "../../llm/modelRouter";
import { createContextBlock } from "../../prompting/core/contextBudget";
import { streamTextPrompt } from "../../prompting/core/promptRunner";
import type { PromptStreamRunResult } from "../../prompting/core/promptTypes";
import {
  buildChapterWriterContextBlocks,
  sanitizeWriterContextBlocks,
} from "../../prompting/prompts/novel/chapterLayeredContext";
import { chapterWriterPrompt } from "../../prompting/prompts/novel/chapterWriter.prompts";
import {
  buildDraftContinuationBlock,
  buildSceneContractBlock,
  countChapterCharacters,
  resolveSceneWordRange,
} from "./chapterWritingGraphShared";
import {
  buildSceneRoundPlan,
  flushSceneStreamingBufferWithLimit,
  type SceneRoundPlan,
  type SceneWordControlMode,
} from "./runtime/sceneBudgetRuntime";
import { toText } from "./novelP0Utils";

interface ChapterRef {
  id: string;
  title: string;
  order: number;
  content?: string | null;
  expectation?: string | null;
  targetWordCount?: number | null;
}

interface ChapterSceneStreamingOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  taskType?: TaskType;
}

interface ChapterSceneStreamInput {
  novelTitle: string;
  chapter: ChapterRef;
  contextPackage: GenerationContextPackage;
  scene: ChapterSceneCard;
  sceneIndex: number;
  sceneCount: number;
  chapterTargetWordCount: number;
  currentChapterContent: string;
  options: ChapterSceneStreamingOptions;
  logWarn: (message: string, meta?: Record<string, unknown>) => void;
}

interface SceneStreamResult {
  sceneContent: string;
  actualWordCount: number;
  sceneStatus: string;
  wordControlMode: SceneWordControlMode;
  closingPhaseTriggered: boolean;
  hardStopCount: number;
  roundResults: RuntimeSceneRoundResult[];
}

function createAsyncChunkQueue() {
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

  const stream = {
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
  };

  return {
    stream,
    push,
    end,
    fail,
  };
}

function resolveSceneWordControlMode(_sceneRange: {
  targetWordCount: number;
}): SceneWordControlMode {
  return "prompt_only";
}

export function buildChapterSceneWriterBlocks(input: {
  contextPackage: GenerationContextPackage;
  scene: ChapterSceneCard;
  sceneIndex: number;
  sceneCount: number;
  currentContent: string;
  roundPlan?: SceneRoundPlan | null;
}) {
  const writeContext = input.contextPackage.chapterWriteContext;
  if (!writeContext) {
    throw new Error("Chapter write context is required.");
  }
  const builtBlocks = buildChapterWriterContextBlocks(writeContext);
  const sceneRange = resolveSceneWordRange(input.scene.targetWordCount);
  const extraBlocks = [
    buildSceneContractBlock({
      scene: input.scene,
      sceneIndex: input.sceneIndex,
      sceneCount: input.sceneCount,
      roundPlan: input.roundPlan,
    }),
    input.currentContent.trim()
      ? createContextBlock({
        id: `current_draft_excerpt_${input.scene.key}`,
        group: "current_draft_excerpt",
        priority: 99,
        required: true,
        content: buildDraftContinuationBlock(
          input.currentContent,
        ),
      })
      : null,
  ].filter((block): block is ReturnType<typeof createContextBlock> => Boolean(block));
  const sanitized = sanitizeWriterContextBlocks([
    ...extraBlocks,
    ...builtBlocks,
  ]);
  return {
    allowedBlocks: sanitized.allowedBlocks,
    removedBlockIds: sanitized.removedBlockIds,
    sceneRange,
  };
}

async function streamSceneRound(input: {
  streamed: PromptStreamRunResult<string>;
  hardRoundWordLimit: number | null;
  emitChunk: (chunk: BaseMessageChunk) => void;
}): Promise<{
  content: string;
  hardStopTriggered: boolean;
  trimmedAtSentenceBoundary: boolean;
}> {
  let visibleContent = "";
  let pendingBuffer = "";
  let hardStopTriggered = false;
  let trimmedAtSentenceBoundary = false;

  for await (const chunk of input.streamed.stream as AsyncIterable<BaseMessageChunk>) {
    const delta = toText(chunk.content);
    if (!delta) {
      continue;
    }

    if (input.hardRoundWordLimit && !hardStopTriggered) {
      pendingBuffer += delta;
      const flushed = flushSceneStreamingBufferWithLimit({
        alreadyEmitted: visibleContent,
        pendingText: pendingBuffer,
        hardLimit: input.hardRoundWordLimit,
      });
      if (flushed.emittedText) {
        visibleContent += flushed.emittedText;
        input.emitChunk(new AIMessageChunk({ content: flushed.emittedText }));
      }
      pendingBuffer = flushed.remainingText;
      hardStopTriggered = flushed.reachedLimit;
      trimmedAtSentenceBoundary = trimmedAtSentenceBoundary || flushed.trimmedAtSentenceBoundary;
      continue;
    }

    if (input.hardRoundWordLimit && hardStopTriggered) {
      continue;
    }

    visibleContent += delta;
    input.emitChunk(new AIMessageChunk({ content: delta }));
  }

  if (input.hardRoundWordLimit && !hardStopTriggered && pendingBuffer) {
    const flushed = flushSceneStreamingBufferWithLimit({
      alreadyEmitted: visibleContent,
      pendingText: pendingBuffer,
      hardLimit: input.hardRoundWordLimit,
      forceFlushTail: true,
    });
    if (flushed.emittedText) {
      visibleContent += flushed.emittedText;
      input.emitChunk(new AIMessageChunk({ content: flushed.emittedText }));
    }
    hardStopTriggered = hardStopTriggered || flushed.reachedLimit;
    trimmedAtSentenceBoundary = trimmedAtSentenceBoundary || flushed.trimmedAtSentenceBoundary;
  }

  return {
    content: visibleContent,
    hardStopTriggered,
    trimmedAtSentenceBoundary,
  };
}

async function runSceneStreaming(input: ChapterSceneStreamInput, emitChunk: (chunk: BaseMessageChunk) => void): Promise<SceneStreamResult> {
  const sceneRange = resolveSceneWordRange(input.scene.targetWordCount);
  const wordControlMode = resolveSceneWordControlMode(sceneRange);
  let currentSceneContent = "";
  let sceneStatus = "empty";
  let closingPhaseTriggered = false;
  let hardStopCount = 0;
  const roundResults: RuntimeSceneRoundResult[] = [];
  const maxRounds = buildSceneRoundPlan({
    sceneTargetWordCount: sceneRange.targetWordCount,
    sceneMinWordCount: sceneRange.minWordCount,
    sceneMaxWordCount: sceneRange.maxWordCount,
    chapterTargetWordCount: input.chapterTargetWordCount,
    currentSceneWordCount: 0,
    currentChapterWordCount: countChapterCharacters(input.currentChapterContent),
    remainingChapterWordCount: Math.max(
      input.chapterTargetWordCount - countChapterCharacters(input.currentChapterContent),
      0,
    ),
    roundIndex: 1,
    mode: wordControlMode,
  }).maxRounds;

  for (let roundIndex = 1; roundIndex <= maxRounds; roundIndex += 1) {
    const chapterDraft = [input.currentChapterContent.trim(), currentSceneContent.trim()]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    const roundPlan = buildSceneRoundPlan({
      sceneTargetWordCount: sceneRange.targetWordCount,
      sceneMinWordCount: sceneRange.minWordCount,
      sceneMaxWordCount: sceneRange.maxWordCount,
      chapterTargetWordCount: input.chapterTargetWordCount,
      currentSceneWordCount: countChapterCharacters(currentSceneContent),
      currentChapterWordCount: countChapterCharacters(chapterDraft),
      remainingChapterWordCount: Math.max(
        input.chapterTargetWordCount - countChapterCharacters(chapterDraft),
        0,
      ),
      roundIndex,
      mode: wordControlMode,
    });
    closingPhaseTriggered = closingPhaseTriggered || roundPlan.closingPhase;
    const writerBlocks = buildChapterSceneWriterBlocks({
      contextPackage: input.contextPackage,
      scene: input.scene,
      sceneIndex: input.sceneIndex,
      sceneCount: input.sceneCount,
      currentContent: chapterDraft,
      roundPlan,
    });
    if (writerBlocks.removedBlockIds.length > 0) {
      input.logWarn("Writer context blocks removed by guard", {
        chapterOrder: input.chapter.order,
        removedBlockIds: writerBlocks.removedBlockIds,
      });
    }
    const streamed = await streamTextPrompt({
      asset: chapterWriterPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        chapterOrder: input.chapter.order,
        chapterTitle: input.chapter.title,
        mode: chapterDraft ? "continue" : "draft",
        wordControlMode,
        sceneIndex: input.sceneIndex,
        sceneCount: input.sceneCount,
        sceneTitle: input.scene.title,
        scenePurpose: input.scene.purpose,
        roundIndex: roundPlan.roundIndex,
        maxRounds: roundPlan.maxRounds,
        isFinalRound: roundPlan.isFinalRound,
        closingPhase: roundPlan.closingPhase,
        entryState: input.scene.entryState,
        exitState: input.scene.exitState,
        forbiddenExpansion: input.scene.forbiddenExpansion,
      },
      contextBlocks: writerBlocks.allowedBlocks,
      options: {
        provider: input.options.provider,
        model: input.options.model,
        temperature: input.options.temperature ?? 0.8,
        maxTokens: undefined,
      },
    });
    const roundOutput = await streamSceneRound({
      streamed,
      hardRoundWordLimit: roundPlan.hardRoundWordLimit,
      emitChunk,
    });
    const roundText = roundOutput.content;
    const actualWordCount = countChapterCharacters(roundText);
    if (roundText.trim()) {
      currentSceneContent = `${currentSceneContent}${roundText}`;
      sceneStatus = roundOutput.hardStopTriggered ? "generated_with_round_limit" : "generated";
    }
    if (roundOutput.hardStopTriggered) {
      hardStopCount += 1;
    }
    roundResults.push({
      roundIndex: roundPlan.roundIndex,
      suggestedWordCount: roundPlan.suggestedRoundWordCount,
      hardWordLimit: roundPlan.hardRoundWordLimit,
      actualWordCount,
      isFinalRound: roundPlan.isFinalRound,
      closingPhase: roundPlan.closingPhase,
      hardStopTriggered: roundOutput.hardStopTriggered,
      trimmedAtSentenceBoundary: roundOutput.trimmedAtSentenceBoundary,
      stopReason: !roundText.trim()
        ? "empty_output"
        : roundOutput.hardStopTriggered
          ? "hard_limit_reached"
          : roundPlan.isFinalRound
            ? "final_round_completed"
            : "round_completed",
    });
    const accumulatedSceneWords = countChapterCharacters(currentSceneContent);
    if (!roundText.trim()) {
      break;
    }
    if (accumulatedSceneWords >= sceneRange.maxWordCount) {
      sceneStatus = roundOutput.hardStopTriggered ? sceneStatus : "generated_at_scene_ceiling";
      break;
    }
    if (roundPlan.isFinalRound) {
      break;
    }
    if (accumulatedSceneWords >= sceneRange.targetWordCount) {
      sceneStatus = "generated_near_target";
      break;
    }
  }

  const actualWordCount = countChapterCharacters(currentSceneContent);
  if (!currentSceneContent.trim()) {
    sceneStatus = "empty";
  }
  return {
    sceneContent: currentSceneContent.trim(),
    actualWordCount,
    sceneStatus,
    wordControlMode,
    closingPhaseTriggered,
    hardStopCount,
    roundResults,
  };
}

export function createChapterSceneStream(input: ChapterSceneStreamInput): {
  stream: AsyncIterable<BaseMessageChunk>;
  complete: Promise<SceneStreamResult>;
} {
  const queue = createAsyncChunkQueue();
  let resolveComplete!: (value: SceneStreamResult) => void;
  let rejectComplete!: (reason?: unknown) => void;
  const complete = new Promise<SceneStreamResult>((resolve, reject) => {
    resolveComplete = resolve;
    rejectComplete = reject;
  });

  void (async () => {
    try {
      const result = await runSceneStreaming(input, (chunk) => queue.push(chunk));
      resolveComplete(result);
      queue.end();
    } catch (error) {
      rejectComplete(error);
      queue.fail(error);
    }
  })();

  return {
    stream: queue.stream,
    complete,
  };
}
