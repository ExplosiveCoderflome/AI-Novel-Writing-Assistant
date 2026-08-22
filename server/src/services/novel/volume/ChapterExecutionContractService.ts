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
import { ChapterExecutionContractQualityGateError } from "./ChapterExecutionContractQualityGateError";

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

export class ChapterExecutionContractService {
  constructor(private readonly deps: ChapterExecutionContractServiceDeps) {}

  async ensureChapterExecutionContract(
    novelId: string,
    chapterId: string,
    options: EnsureChapterExecutionContractOptions = {},
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

    const databaseScenePlan = parseChapterScenePlan(chapter.sceneCards, {
      targetWordCount: chapter.targetWordCount ?? undefined,
    });
    const hasCompleteDatabaseContract = Boolean(
      typeof chapter.conflictLevel === "number"
      && typeof chapter.revealLevel === "number"
      && typeof chapter.targetWordCount === "number"
      && chapter.mustAvoid?.trim()
      && chapter.taskSheet?.trim()
      && databaseScenePlan,
    );

    let workspace: VolumePlanDocument;
    let matched: { volumeId: string; volumeChapterId: string };
    try {
      workspace = await this.deps.ensureVolumeWorkspace(novelId);
      matched = this.deps.findVolumeChapterMatch(workspace, {
        order: chapter.order,
        title: chapter.title,
      });
    } catch (error) {
      if (hasCompleteDatabaseContract) {
        const styleContract = await this.resolveStyleContract(novelId, chapterId, options.taskStyleProfileId);
        return { ...chapter, styleContract };
      }
      throw error;
    }

    if (hasCompleteDatabaseContract) {
      const styleContract = await this.resolveStyleContract(novelId, chapterId, options.taskStyleProfileId);
      return { ...chapter, styleContract };
    }

    const existingVolume = workspace.volumes.find((volume) => volume.id === matched.volumeId);
    const existingVolumeChapter = existingVolume?.chapters.find((item) => item.id === matched.volumeChapterId);
    const existingScenePlan = parseChapterScenePlan(existingVolumeChapter?.sceneCards, {
      targetWordCount: existingVolumeChapter?.targetWordCount ?? undefined,
    });
    const existingQuality = existingVolumeChapter
      ? assessChapterExecutionContractShape({
        novelId,
        volumeId: matched.volumeId,
        chapterId,
        chapterOrder: chapter.order,
        title: chapter.title,
        summary: existingVolumeChapter.summary,
        purpose: existingVolumeChapter.purpose,
        exclusiveEvent: existingVolumeChapter.exclusiveEvent,
        endingState: existingVolumeChapter.endingState,
        nextChapterEntryState: existingVolumeChapter.nextChapterEntryState,
        conflictLevel: existingVolumeChapter.conflictLevel,
        revealLevel: existingVolumeChapter.revealLevel,
        targetWordCount: existingVolumeChapter.targetWordCount,
        mustAvoid: existingVolumeChapter.mustAvoid,
        payoffRefs: existingVolumeChapter.payoffRefs,
        taskSheet: existingVolumeChapter.taskSheet,
        sceneCards: existingVolumeChapter.sceneCards,
      })
      : null;
    if (existingQuality?.canEnterExecution && existingScenePlan) {
      const syncedChapter = await prisma.chapter.update({
        where: { id: chapterId },
        data: {
          targetWordCount: existingVolumeChapter?.targetWordCount ?? null,
          conflictLevel: existingVolumeChapter?.conflictLevel ?? null,
          revealLevel: existingVolumeChapter?.revealLevel ?? null,
          mustAvoid: existingVolumeChapter?.mustAvoid ?? null,
          taskSheet: existingVolumeChapter?.taskSheet?.trim() || null,
          sceneCards: existingVolumeChapter?.sceneCards ?? null,
        },
      });
      const styleContract = await this.resolveStyleContract(novelId, chapterId, options.taskStyleProfileId);
      return {
        ...syncedChapter,
        styleContract,
      };
    }

    const generatedDocument = await generateVolumePlanDocument({
      novelId,
      workspace,
      options: {
        ...options,
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
      throw new ChapterExecutionContractQualityGateError({
        novelId,
        volumeId: matched.volumeId,
        chapterId,
        chapterOrder: chapter.order,
        message: "AI 未返回完整的章节执行合同。",
      });
    }
    const taskSheet = targetChapter.taskSheet.trim();
    const scenePlan = parseChapterScenePlan(targetChapter.sceneCards, {
      targetWordCount: targetChapter.targetWordCount ?? chapter.targetWordCount ?? undefined,
    });
    if (!scenePlan) {
      throw new ChapterExecutionContractQualityGateError({
        novelId,
        volumeId: matched.volumeId,
        chapterId,
        chapterOrder: chapter.order,
        message: "章节执行合同中的场景预算无效。",
      });
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
      throw new ChapterExecutionContractQualityGateError({
        novelId,
        volumeId: matched.volumeId,
        chapterId,
        chapterOrder: chapter.order,
        message: formatChapterTaskSheetQualityFailure(finalQuality),
      });
    }

    const styleContract = await this.resolveStyleContract(novelId, chapterId, options.taskStyleProfileId);
    targetChapter.styleContract = styleContract;

    const persistedChapter = await runVolumeWorkspaceTransaction(async (tx) => {
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
