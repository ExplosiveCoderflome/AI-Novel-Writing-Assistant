import { prisma } from "../../../../db/prisma";
import { parseChapterScenePlan, serializeChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
import { assessChapterExecutionContractShape, formatChapterTaskSheetQualityFailure } from "@ai-novel/shared/types/chapterTaskSheetQuality";
import { generateVolumePlanDocument } from "../volumeGenerationOrchestrator";
import { reviewChapterExecutionContinuity } from "../chapterDetail";
import { ChapterTaskSheetQualityGateError } from "../ChapterTaskSheetQualityGateService";
import type { ChapterExecutionContractServiceDeps, ChapterContractPreparationPorts, EnsureChapterExecutionContractOptions } from "./types";
import type { PreparedChapterExecutionContract } from "./prepare";
import { resolveStyleContract } from "./style";
export async function evaluateExecutionContract(prepared: PreparedChapterExecutionContract,
  options: EnsureChapterExecutionContractOptions, deps: ChapterExecutionContractServiceDeps, ports?: ChapterContractPreparationPorts) {
  const { novelId, chapterId, chapter, workspace, matched, currentRequirement, readiness } = prepared;
    let continuityGuidance: string | undefined;
    let reviewedPrevious: { order: number; content: string } | null = null;
    if (readiness?.canReuse && currentRequirement && !chapter.content?.trim() && chapter.order > 1) {
      const previous = prepared.previous;
      if (previous?.content?.trim()) reviewedPrevious = { order: previous.order, content: previous.content };
      const checked = previous?.content?.trim() ? await (ports?.reviewContinuity ?? reviewChapterExecutionContinuity)({
        ...currentRequirement, novelId, volumeId: matched.volumeId, chapterId, chapterOrder: chapter.order,
        previousChapterResult: { chapterOrder: previous.order, title: previous.title, summary: "", tail: previous.content.slice(-800), content: previous.content },
      }, { ...options, mode: options.chapterTaskSheetQualityMode ?? "ai_copilot" }) : null;
      if (checked && (checked.assessment.recommendedHandling !== "use_as_is" || checked.result.status !== "passed")) {
        if (!checked.result.canEnterExecution) throw new ChapterTaskSheetQualityGateError(checked.result);
        continuityGuidance = [checked.result.summary, ...checked.result.repairGuidance,
          ...checked.result.issues.map(issue => issue.repairHint)].filter(Boolean).join("\n");
      }
    }
    if (readiness?.canReuse && !continuityGuidance) {
      if (reviewedPrevious) {
        const source = await (ports?.db ?? prisma).chapter.findFirst({ where: { novelId, order: reviewedPrevious.order }, select: { content: true } });
        if (source?.content !== reviewedPrevious.content) throw new Error("前章正文在规划核对期间发生变化，请重新准备本章。");
      }
      const styleContract = ports ? prepared.preparedStyleContract : await resolveStyleContract(deps, novelId, chapterId, options.taskStyleProfileId);
      return { kind: "reuse" as const, styleContract, reviewedPrevious };
    }
    const generatedDocument = await (ports?.generateDocument ?? generateVolumePlanDocument)({
      novelId,
      workspace,
      options: {
        ...options,
        ...(continuityGuidance ? { forceRegenerate: true,
          guidance: [options.guidance, "上一章实际正文与本章规划需要协调，保留本章目标并按以下核对结果修订入口、场景和收尾：", continuityGuidance].filter(Boolean).join("\n") } : {}),
        scope: "chapter_detail",
        detailMode: "task_sheet",
        targetVolumeId: matched.volumeId,
        targetChapterId: matched.volumeChapterId,
        chapterTaskSheetQualityMode: options.chapterTaskSheetQualityMode
          ?? (options.entrypoint === "auto_director" ? "full_book_autopilot" : "ai_copilot"),
      },
      storyMacroPlanService: deps.storyMacroPlanService,
    });

    const targetVolume = generatedDocument.volumes.find((volume) => volume.id === matched.volumeId);
    const targetChapter = targetVolume?.chapters.find((item) => item.id === matched.volumeChapterId);
    if (!targetChapter?.taskSheet?.trim() || !targetChapter.sceneCards?.trim()) {
      throw new Error("AI 未返回完整的章节执行合同。");
    }
    const taskSheet = targetChapter.taskSheet.trim();
    const scenePlan = parseChapterScenePlan(targetChapter.sceneCards, {
      targetWordCount: targetChapter.targetWordCount ?? chapter.targetWordCount ?? undefined,
    });
    if (!scenePlan) {
      throw new Error("章节执行合同中的场景预算无效。");
    }
    const finalQuality = assessChapterExecutionContractShape({
      novelId,
      volumeId: matched.volumeId,
      chapterId,
      chapterOrder: chapter.order,
      title: chapter.title,
      summary: targetChapter.summary,
      purpose: targetChapter.purpose,
      exclusiveEvent: targetChapter.exclusiveEvent,
      endingState: targetChapter.endingState,
      nextChapterEntryState: targetChapter.nextChapterEntryState,
      conflictLevel: targetChapter.conflictLevel,
      revealLevel: targetChapter.revealLevel,
      targetWordCount: targetChapter.targetWordCount,
      mustAvoid: targetChapter.mustAvoid,
      payoffRefs: targetChapter.payoffRefs,
      taskSheet,
      sceneCards: serializeChapterScenePlan(scenePlan),
    });
    if (!finalQuality.canEnterExecution) {
      throw new Error(formatChapterTaskSheetQualityFailure(finalQuality));
    }

    const styleContract = ports ? prepared.preparedStyleContract : await resolveStyleContract(deps, novelId, chapterId, options.taskStyleProfileId);
    targetChapter.styleContract = styleContract;


  return { kind: "write" as const, generatedDocument, targetChapter, taskSheet,
    sceneCards: serializeChapterScenePlan(scenePlan), styleContract, reviewedPrevious };
}
export type EvaluatedChapterExecutionContract = Awaited<ReturnType<typeof evaluateExecutionContract>>;
