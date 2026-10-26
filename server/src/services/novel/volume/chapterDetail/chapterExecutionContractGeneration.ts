import type {
  VolumeBeatSheet,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import { assessChapterExecutionContractShape } from "@ai-novel/shared/types/chapterTaskSheetQuality";
import {
  ChapterScenePlanNormalizationError,
  normalizeChapterScenePlan,
  serializeChapterScenePlan,
} from "@ai-novel/shared/types/chapterLengthControl";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { StructuredOutputError } from "../../../../llm/structuredOutput";
import { volumeChapterExecutionContractPrompt } from "../../../../prompting/prompts/novel/volume/chapterDetail.prompts";
import { buildVolumeChapterDetailContextBlocks } from "../../../../prompting/prompts/novel/volume/contextBlocks";
import type { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import {
  ChapterTaskSheetQualityGateService,
  ChapterTaskSheetQualityGateError,
} from "../ChapterTaskSheetQualityGateService";
import type {
  VolumeGenerateOptions,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "../volumeModels";

type StoryMacroPlanResult = Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
type ContractResult = {
  purpose: string; exclusiveEvent: string; endingState: string; nextChapterEntryState: string;
  conflictLevel: number; revealLevel: number; targetWordCount: number; mustAvoid: string;
  payoffRefs: string[]; taskSheet: string; sceneCards: string;
};
type QualityEvent = Parameters<NonNullable<VolumeGenerateOptions["onChapterTaskSheetQuality"]>>[0];

export function shouldRetryChapterExecutionContract(error: unknown, attempt: number): boolean {
  if (attempt > 0) {
    return false;
  }
  if (error instanceof ChapterScenePlanNormalizationError) {
    return true;
  }
  return Boolean(
    error
    && typeof error === "object"
    && (error as { promptQualityFailureKind?: unknown }).promptQualityFailureKind === "post_validate_failed"
  );
}

export function canReuseChapterExecutionContract(input: {
  novelId: string;
  volumeId: string;
  chapter: VolumePlan["chapters"][number];
}): boolean {
  return assessChapterExecutionContractShape({
    novelId: input.novelId,
    volumeId: input.volumeId,
    chapterId: input.chapter.id,
    chapterOrder: input.chapter.chapterOrder,
    title: input.chapter.title,
    summary: input.chapter.summary,
    purpose: input.chapter.purpose,
    exclusiveEvent: input.chapter.exclusiveEvent,
    endingState: input.chapter.endingState,
    nextChapterEntryState: input.chapter.nextChapterEntryState,
    conflictLevel: input.chapter.conflictLevel,
    revealLevel: input.chapter.revealLevel,
    targetWordCount: input.chapter.targetWordCount,
    mustAvoid: input.chapter.mustAvoid,
    payoffRefs: input.chapter.payoffRefs,
    taskSheet: input.chapter.taskSheet,
    sceneCards: input.chapter.sceneCards,
  }).canEnterExecution;
}

export async function generateChapterTaskSheetDetail(params: {
  promptInput: {
    previousChapterResult?: import("@ai-novel/shared/types/chapterTaskSheetQuality").ChapterExecutionContractQualityCandidate["previousChapterResult"];
    novel: VolumeGenerationNovel;
    workspace: VolumeWorkspace;
    storyMacroPlan: StoryMacroPlanResult;
    strategyPlan: VolumePlanDocument["strategyPlan"];
    targetVolume: VolumePlan;
    targetBeatSheet: VolumeBeatSheet | null;
    targetChapter: VolumePlan["chapters"][number];
    guidance?: string;
    detailMode: "task_sheet";
  };
  options: VolumeGenerateOptions;
}): Promise<ContractResult> {
  const existingChapter = params.promptInput.targetChapter;
  if (
    !params.options.forceRegenerate &&
    !params.promptInput.guidance?.trim()
    && canReuseChapterExecutionContract({
      novelId: params.promptInput.workspace.novelId,
      volumeId: params.promptInput.targetVolume.id,
      chapter: existingChapter,
    })
  ) {
    const scenePlan = normalizeChapterScenePlan(
      JSON.parse(existingChapter.sceneCards ?? "{}"),
      existingChapter.targetWordCount,
    );
    return {
      purpose: existingChapter.purpose?.trim() || existingChapter.summary.trim(),
      exclusiveEvent: existingChapter.exclusiveEvent?.trim() || existingChapter.summary.trim(),
      endingState: existingChapter.endingState?.trim() || "本章完成当前章节任务，并为下一章留下明确入口。",
      nextChapterEntryState: existingChapter.nextChapterEntryState?.trim() || existingChapter.endingState?.trim() || "下一章承接本章结果继续推进。",
      conflictLevel: existingChapter.conflictLevel ?? 3,
      revealLevel: existingChapter.revealLevel ?? 2,
      targetWordCount: existingChapter.targetWordCount ?? 2200,
      mustAvoid: existingChapter.mustAvoid?.trim() || "避免偏离本章任务单和卷节奏。",
      payoffRefs: existingChapter.payoffRefs,
      taskSheet: existingChapter.taskSheet?.trim() ?? "",
      sceneCards: serializeChapterScenePlan(scenePlan),
    };
  }

  let lastError: Error | null = null;
  let qualityFeedback: string | null = null;
  let usable: {value: ContractResult; report: QualityEvent} | null = null;
  const qualityGate = new ChapterTaskSheetQualityGateService(params.options.chapterContractPorts?.semanticAssessor);
  const publish = async (saved: NonNullable<typeof usable>) => {
    await params.options.onChapterTaskSheetQuality?.(saved.report);
    return saved.value;
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const promptInput = qualityFeedback
        ? {
          ...params.promptInput,
          guidance: [
            params.promptInput.guidance?.trim(),
            `上一版章节执行合同未通过质量门禁：${qualityFeedback}`,
          ].filter(Boolean).join("\n"),
        }
        : params.promptInput;
      const generated = await (params.options.chapterContractPorts?.invokePrompt ?? runStructuredPrompt)({
        asset: volumeChapterExecutionContractPrompt,
        promptInput,
        contextBlocks: buildVolumeChapterDetailContextBlocks(promptInput),
        options: {
          provider: params.options.provider,
          model: params.options.model,
          temperature: params.options.temperature ?? 0.35,
          maxTokens: 3_200,
          taskId: params.options.taskId,
          entrypoint: params.options.entrypoint,
          novelId: promptInput.workspace.novelId,
          volumeId: promptInput.targetVolume.id,
          chapterId: promptInput.targetChapter.id,
          stage: "chapter_execution_contract",
          itemKey: "chapter_detail_bundle",
          scope: "chapter_detail",
          triggerReason: "chapter_detail_generation",
          signal: params.options.signal,
        },
      });
      const scenePlan = normalizeChapterScenePlan(
        {
          scenes: generated.output.sceneCards,
          readerExperience: generated.output.readerExperience,
        },
        generated.output.targetWordCount ?? promptInput.targetChapter.targetWordCount,
      );
      let assessment: QualityEvent["assessment"];
      const quality = await qualityGate.evaluate({
        previousChapterResult: promptInput.previousChapterResult,
        novelId: promptInput.workspace.novelId,
        volumeId: promptInput.targetVolume.id,
        chapterId: promptInput.targetChapter.id,
        chapterOrder: promptInput.targetChapter.chapterOrder,
        title: promptInput.targetChapter.title,
        summary: promptInput.targetChapter.summary,
        purpose: generated.output.purpose,
        exclusiveEvent: generated.output.exclusiveEvent,
        endingState: generated.output.endingState,
        nextChapterEntryState: generated.output.nextChapterEntryState,
        conflictLevel: generated.output.conflictLevel,
        revealLevel: generated.output.revealLevel,
        targetWordCount: generated.output.targetWordCount,
        mustAvoid: generated.output.mustAvoid,
        payoffRefs: generated.output.payoffRefs,
        taskSheet: generated.output.taskSheet,
        sceneCards: serializeChapterScenePlan(scenePlan),
      }, {
        mode: params.options.chapterTaskSheetQualityMode,
        onEvaluated: event => {assessment = event.assessment;},
        provider: params.options.provider,
        model: params.options.model,
        taskId: params.options.taskId,
        entrypoint: params.options.entrypoint,
        signal: params.options.signal,
      });
      if (!quality.canEnterExecution) throw new ChapterTaskSheetQualityGateError(quality);
      const guidance = [...quality.repairGuidance, ...quality.issues.map(issue => issue.repairHint)].filter(Boolean);
      const value = {
        purpose: generated.output.purpose.trim(),
        exclusiveEvent: generated.output.exclusiveEvent.trim(),
        endingState: generated.output.endingState.trim(),
        nextChapterEntryState: generated.output.nextChapterEntryState.trim(),
        conflictLevel: generated.output.conflictLevel,
        revealLevel: generated.output.revealLevel,
        targetWordCount: generated.output.targetWordCount,
        mustAvoid: generated.output.mustAvoid.trim(),
        payoffRefs: generated.output.payoffRefs,
        taskSheet: [generated.output.taskSheet.trim(), ...(guidance.length ? [
          "本章规划核对指导（写作、审校与修文共同遵守；优先保持前文事实，不得为修复而提前越章）：",
          ...[...new Set(guidance)].map(item => `- ${item}`),
        ] : [])].join("\n"),
        sceneCards: serializeChapterScenePlan(scenePlan),
      };
      usable = {value, report: {chapterId: promptInput.targetChapter.id, chapterOrder: promptInput.targetChapter.chapterOrder,
        result: quality, assessment}};
      // Share the existing two-attempt allowance with shape repair; never add a third generation.
      if (attempt === 0 && params.options.chapterTaskSheetQualityMode === "full_book_autopilot"
        && assessment?.recommendedHandling === "repair_contract") {
        qualityFeedback = [quality.summary, ...guidance].join("\n");
        continue;
      }
      return publish(usable);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("章节执行合同生成失败。");
      if (attempt > 0 && usable && !params.options.signal?.aborted && (
        shouldRetryChapterExecutionContract(error, 0)
        || (error instanceof StructuredOutputError && error.category !== "transport_error")
      )) return publish(usable);
      if (!shouldRetryChapterExecutionContract(error, attempt)) {
        throw lastError;
      }
      qualityFeedback = lastError.message;
    }
  }

  throw lastError ?? new Error("章节执行合同生成失败。");
}
