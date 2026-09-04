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

    const existingScenePlan = parseChapterScenePlan(chapter.sceneCards, {
      targetWordCount: chapter.targetWordCount ?? undefined,
    });
    if (
      typeof chapter.conflictLevel === "number"
      && typeof chapter.revealLevel === "number"
      && typeof chapter.targetWordCount === "number"
      && chapter.mustAvoid?.trim()
      && chapter.taskSheet?.trim()
      && existingScenePlan
    ) {
      const styleContract = await this.resolveStyleContract(novelId, chapterId, options.taskStyleProfileId);
      return {
        ...chapter,
        styleContract,
      };
    }

    const workspace = await this.deps.ensureVolumeWorkspace(novelId);
    const matched = this.deps.findVolumeChapterMatch(workspace, {
      order: chapter.order,
      title: chapter.title,
    });
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
