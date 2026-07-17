import type {
  VolumeBeatSheet,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import {
  normalizeChapterScenePlan,
  serializeChapterScenePlan,
} from "@ai-novel/shared/types/chapterLengthControl";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { volumeChapterExecutionContractPrompt } from "../../../../prompting/prompts/novel/volume/chapterDetail.prompts";
import { buildVolumeChapterDetailContextBlocks } from "../../../../prompting/prompts/novel/volume/contextBlocks";
import type { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import {
  ChapterTaskSheetQualityGateError,
  ChapterTaskSheetQualityGateService,
} from "../ChapterTaskSheetQualityGateService";
import type {
  VolumeGenerateOptions,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "../volumeModels";

type StoryMacroPlanResult = Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;

export async function generateChapterTaskSheetDetail(params: {
  promptInput: {
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
}): Promise<{
  purpose: string;
  exclusiveEvent: string;
  endingState: string;
  nextChapterEntryState: string;
  conflictLevel: number;
  revealLevel: number;
  targetWordCount: number;
  mustAvoid: string;
  payoffRefs: string[];
  taskSheet: string;
  sceneCards: string;
}> {
  const existingChapter = params.promptInput.targetChapter;
  if (
    !params.promptInput.guidance?.trim()
    && existingChapter.taskSheet?.trim()
    && existingChapter.sceneCards?.trim()
  ) {
    const scenePlan = normalizeChapterScenePlan(
      existingChapter.sceneCards,
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
      taskSheet: existingChapter.taskSheet.trim(),
      sceneCards: serializeChapterScenePlan(scenePlan),
    };
  }

  let lastError: Error | null = null;
  let qualityFeedback: string | null = null;
  const qualityGate = new ChapterTaskSheetQualityGateService();

  for (let attempt = 0; attempt < 3; attempt += 1) {
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
      const generated = await runStructuredPrompt({
        asset: volumeChapterExecutionContractPrompt,
        promptInput,
        contextBlocks: buildVolumeChapterDetailContextBlocks(promptInput),
        options: {
          provider: params.options.provider,
          model: params.options.model,
          temperature: params.options.temperature ?? 0.35,
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
      await qualityGate.assertCanEnterExecution({
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
        provider: params.options.provider,
        model: params.options.model,
        taskId: params.options.taskId,
        entrypoint: params.options.entrypoint,
        signal: params.options.signal,
      });
      return {
        purpose: generated.output.purpose.trim(),
        exclusiveEvent: generated.output.exclusiveEvent.trim(),
        endingState: generated.output.endingState.trim(),
        nextChapterEntryState: generated.output.nextChapterEntryState.trim(),
        conflictLevel: generated.output.conflictLevel,
        revealLevel: generated.output.revealLevel,
        targetWordCount: generated.output.targetWordCount,
        mustAvoid: generated.output.mustAvoid.trim(),
        payoffRefs: generated.output.payoffRefs,
        taskSheet: generated.output.taskSheet.trim(),
        sceneCards: serializeChapterScenePlan(scenePlan),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("章节执行合同生成失败。");
      if (error instanceof ChapterTaskSheetQualityGateError) {
        qualityFeedback = error.message;
      }
    }
  }

  throw lastError ?? new Error("章节执行合同生成失败。");
}
