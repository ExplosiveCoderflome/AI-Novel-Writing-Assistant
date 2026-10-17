import type { Prisma } from "@prisma/client";
import { parseChapterScenePlan, serializeChapterScenePlan } from "@ai-novel/shared/types/chapterLengthControl";
import {
  assessChapterExecutionContractShape,
  formatChapterTaskSheetQualityFailure,
} from "@ai-novel/shared/types/chapterTaskSheetQuality";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import type { StyleBindingService } from "../../styleEngine/StyleBindingService";
import { buildWriterStyleContractText } from "../../styleEngine/styleContractText";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import type { VolumeGenerateOptions } from "./volumeModels";
import { generateVolumePlanDocument } from "./volumeGenerationOrchestrator";
import {
  persistActiveVolumeWorkspace,
  runVolumeWorkspaceTransaction,
} from "./volumeWorkspacePersistence";
import { serializeVolumeWorkspaceDocument } from "./volumeWorkspaceDocument";
import { inspectChapterExecutionContractReadiness } from "./chapterDetail/chapterExecutionContractReadiness";
import { reviewChapterExecutionContinuity } from "./chapterDetail";
import { ChapterTaskSheetQualityGateError } from "./ChapterTaskSheetQualityGateService";

export interface ChapterExecutionContractServiceDeps {
  storyMacroPlanService: Pick<StoryMacroPlanService, "getPlan">;
  styleBindingService: Pick<StyleBindingService, "resolveForGeneration">;
  ensureVolumeWorkspace: (novelId: string) => Promise<VolumePlanDocument>;
  findVolumeChapterMatch: (
    workspace: VolumePlanDocument,
    chapter: { order: number; title: string },
  ) => { volumeId: string; volumeChapterId: string };
  ensureActiveVersionRecord: (
    tx: Prisma.TransactionClient,
    novelId: string,
    document: VolumePlanDocument,
    diffSummary?: string,
  ) => Promise<{ versionId: string; version: number }>;
  emitVolumeUpdated: (novelId: string, reason: "chapter_execution_contract_refined") => void;
}

type EnsureChapterExecutionContractOptions = Pick<
  VolumeGenerateOptions,
  "provider" | "model" | "temperature" | "guidance" | "chapterTaskSheetQualityMode" | "entrypoint" | "taskId" | "signal"
> & {
  taskStyleProfileId?: string;
};

const chapterExecutionContractFlights = new Map<string, Promise<unknown>>();

export function runChapterExecutionContractSingleflight<T>(
  novelId: string,
  chapterId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = `${novelId}:${chapterId}`;
  const active = chapterExecutionContractFlights.get(key);
  if (active) {
    return active as Promise<T>;
  }
  const pending = work().finally(() => {
    if (chapterExecutionContractFlights.get(key) === pending) {
      chapterExecutionContractFlights.delete(key);
    }
  });
  chapterExecutionContractFlights.set(key, pending);
  return pending;
}

export class ChapterExecutionContractService {
  constructor(private readonly deps: ChapterExecutionContractServiceDeps) {}

  async ensureChapterExecutionContract(
    novelId: string,
    chapterId: string,
    options: EnsureChapterExecutionContractOptions = {},
  ) {
    return runChapterExecutionContractSingleflight(novelId, chapterId, () => (
      this.ensureChapterExecutionContractUnlocked(novelId, chapterId, options)
    ));
  }

  private async ensureChapterExecutionContractUnlocked(
    novelId: string,
    chapterId: string,
    options: EnsureChapterExecutionContractOptions,
  ) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: {
        id: true,
        novelId: true,
        title: true,
        order: true,
        targetWordCount: true,
        conflictLevel: true,
        revealLevel: true,
        mustAvoid: true,
        taskSheet: true,
        sceneCards: true,
        content: true,
        expectation: true,
        chapterStatus: true,
        generationState: true,
        repairHistory: true,
        qualityScore: true,
        continuityScore: true,
        characterScore: true,
        pacingScore: true,
        riskFlags: true,
        hook: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!chapter) {
      throw new Error("章节不存在。");
    }

    const workspace = await this.deps.ensureVolumeWorkspace(novelId);
    const matched = this.deps.findVolumeChapterMatch(workspace, {
      order: chapter.order,
      title: chapter.title,
    });
    const currentRequirement = workspace.volumes
      .find((volume) => volume.id === matched.volumeId)
      ?.chapters.find((item) => item.id === matched.volumeChapterId);
    const readiness = currentRequirement
      ? inspectChapterExecutionContractReadiness({
        novelId,
        volumeId: matched.volumeId,
        requirement: currentRequirement,
        persisted: chapter,
      })
      : null;
    let continuityGuidance: string | undefined;
    let reviewedPrevious: { order: number; content: string } | null = null;
    if (readiness?.canReuse && currentRequirement && !chapter.content?.trim() && chapter.order > 1) {
      const previous = await prisma.chapter.findFirst({ where: { novelId, order: chapter.order - 1 },
        select: { order: true, title: true, content: true } });
      if (previous?.content?.trim()) reviewedPrevious = { order: previous.order, content: previous.content };
      const checked = previous?.content?.trim() ? await reviewChapterExecutionContinuity({
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
        const source = await prisma.chapter.findFirst({ where: { novelId, order: reviewedPrevious.order }, select: { content: true } });
        if (source?.content !== reviewedPrevious.content) throw new Error("前章正文在规划核对期间发生变化，请重新准备本章。");
      }
      const styleContract = await this.resolveStyleContract(novelId, chapterId, options.taskStyleProfileId);
      return {
        ...chapter,
        styleContract,
      };
    }
    const generatedDocument = await generateVolumePlanDocument({
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
      storyMacroPlanService: this.deps.storyMacroPlanService,
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

    const styleContract = await this.resolveStyleContract(novelId, chapterId, options.taskStyleProfileId);
    targetChapter.styleContract = styleContract;

    const persistedChapter = await runVolumeWorkspaceTransaction(async (tx) => {
      const current = await tx.chapter.findFirst({ where: { id: chapterId, novelId }, select: { taskSheet: true, sceneCards: true } });
      if (current?.taskSheet !== chapter.taskSheet || current?.sceneCards !== chapter.sceneCards) throw new Error("本章规划在生成期间发生变化，已保留新修改，请重新准备本章。");
      if (reviewedPrevious) {
        const source = await tx.chapter.findFirst({ where: { novelId, order: reviewedPrevious.order }, select: { content: true } });
        if (source?.content !== reviewedPrevious.content) throw new Error("前章正文在规划生成期间发生变化，请重新准备本章。");
      }
      const { versionId } = await this.deps.ensureActiveVersionRecord(
        tx,
        novelId,
        generatedDocument,
        `刷新第${chapter.order}章执行合同。`,
      );
      const persistedDocument = {
        ...generatedDocument,
        activeVersionId: versionId,
        source: "volume" as const,
      };
      await tx.volumePlanVersion.update({
        where: { id: versionId },
        data: {
          contentJson: serializeVolumeWorkspaceDocument(persistedDocument),
        },
      });
      await persistActiveVolumeWorkspace(tx, novelId, persistedDocument, versionId);
      const updatedChapter = await tx.chapter.update({
        where: { id: chapterId },
        data: {
          targetWordCount: targetChapter.targetWordCount ?? chapter.targetWordCount ?? null,
          conflictLevel: targetChapter.conflictLevel ?? chapter.conflictLevel ?? null,
          revealLevel: targetChapter.revealLevel ?? chapter.revealLevel ?? null,
          mustAvoid: targetChapter.mustAvoid ?? chapter.mustAvoid ?? null,
          taskSheet,
          sceneCards: serializeChapterScenePlan(scenePlan),
        },
      });
      return {
        ...updatedChapter,
        styleContract,
      };
    });

    this.deps.emitVolumeUpdated(novelId, "chapter_execution_contract_refined");
    return persistedChapter;
  }

  private async resolveStyleContract(
    novelId: string,
    chapterId: string,
    taskStyleProfileId?: string,
  ): Promise<string | null> {
    const resolvedStyleContext = await this.deps.styleBindingService.resolveForGeneration({
      novelId,
      chapterId,
      taskStyleProfileId,
    }).catch(() => null);
    return buildWriterStyleContractText(resolvedStyleContext?.compiledBlocks?.contract ?? null) || null;
  }
}
