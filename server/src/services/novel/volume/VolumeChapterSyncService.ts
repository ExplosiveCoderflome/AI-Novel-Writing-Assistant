import type { Prisma } from "@prisma/client";
import type {
  VolumePlanDocument,
  VolumeSyncPreview,
} from "@ai-novel/shared/types/novel";
import {
  assessChapterExecutionContractShape,
  formatChapterTaskSheetQualityFailure,
} from "@ai-novel/shared/types/chapterTaskSheetQuality";
import { prisma } from "../../../db/prisma";
import type { VolumeUpdateReason } from "../../../events";
import {
  buildVolumeSyncPlan,
  hasPayoffLedgerRelevantPlanChanges,
  type ExistingChapterRecord,
} from "./volumePlanUtils";
import type { VolumeSyncInput } from "./volumeModels";
import {
  mergeVolumeWorkspaceInput,
  serializeVolumeWorkspaceDocument,
} from "./volumeWorkspaceDocument";
import {
  persistActiveVolumeWorkspace,
  runVolumeWorkspaceTransaction,
} from "./volumeWorkspacePersistence";

export interface VolumeChapterSyncServiceDeps {
  ensureVolumeWorkspace: (novelId: string) => Promise<VolumePlanDocument>;
  ensureActiveVersionRecord: (
    tx: Prisma.TransactionClient,
    novelId: string,
    document: VolumePlanDocument,
    diffSummary?: string,
  ) => Promise<{ versionId: string; version: number }>;
  emitVolumeUpdated: (novelId: string, reason: VolumeUpdateReason) => void;
  syncPayoffLedger: (novelId: string) => void;
}

export interface VolumeChapterSyncOptions {
  emitEvent?: boolean;
  syncPayoffLedger?: boolean;
  volumeUpdateReason?: VolumeUpdateReason;
}

export class VolumeChapterSyncService {
  constructor(private readonly deps: VolumeChapterSyncServiceDeps) {}

  async syncVolumeChaptersWithOptions(
    novelId: string,
    input: VolumeSyncInput,
    options: VolumeChapterSyncOptions = {},
  ): Promise<VolumeSyncPreview> {
    const workspace = await this.deps.ensureVolumeWorkspace(novelId);
    const mergedDocument = mergeVolumeWorkspaceInput(novelId, workspace, { volumes: input.volumes });
    this.assertSyncableChapterExecutionContracts(mergedDocument, input.executionContractChapterRange);
    const shouldSyncPayoffLedger = hasPayoffLedgerRelevantPlanChanges(workspace.volumes, mergedDocument.volumes);
    const existingChapters = await prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        title: true,
        content: true,
        generationState: true,
        chapterStatus: true,
        expectation: true,
        targetWordCount: true,
        conflictLevel: true,
        revealLevel: true,
        mustAvoid: true,
        taskSheet: true,
        sceneCards: true,
      },
    });
    const plan = buildVolumeSyncPlan(
      mergedDocument.volumes,
      existingChapters as ExistingChapterRecord[],
      {
        preserveContent: input.preserveContent !== false,
        applyDeletes: input.applyDeletes === true,
      },
    );

    await runVolumeWorkspaceTransaction(async (tx) => {
      const { versionId } = await this.deps.ensureActiveVersionRecord(tx, novelId, mergedDocument);
      const persistedDocument = {
        ...mergedDocument,
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
      for (const item of plan.creates) {
        await tx.chapter.create({
          data: {
            novelId,
            title: item.chapter.title,
            order: item.chapter.chapterOrder,
            content: "",
            expectation: item.chapter.summary,
            targetWordCount: item.chapter.targetWordCount ?? null,
            conflictLevel: item.chapter.conflictLevel ?? null,
            revealLevel: item.chapter.revealLevel ?? null,
            mustAvoid: item.chapter.mustAvoid ?? null,
            taskSheet: item.chapter.taskSheet?.trim() || null,
            sceneCards: item.chapter.sceneCards ?? null,
          },
        });
      }
      for (const item of plan.updates) {
        await tx.chapter.updateMany({
          where: { id: item.chapterId, novelId },
          data: {
            title: item.chapter.title,
            order: item.chapter.chapterOrder,
            expectation: item.chapter.summary,
            targetWordCount: item.chapter.targetWordCount ?? null,
            conflictLevel: item.chapter.conflictLevel ?? null,
            revealLevel: item.chapter.revealLevel ?? null,
            mustAvoid: item.chapter.mustAvoid ?? null,
            taskSheet: item.chapter.taskSheet?.trim() || null,
            sceneCards: item.chapter.sceneCards ?? null,
            ...(!item.preserveWorkflowState
              ? {
                generationState: "planned",
                chapterStatus: "unplanned",
              }
              : {}),
            ...(item.clearContent ? { content: "" } : {}),
          },
        });
      }
      if (plan.updates.length > 0) {
        await tx.storyPlan.updateMany({
          where: { novelId, level: "chapter", chapterId: { in: plan.updates.map((item) => item.chapterId) } },
          data: { status: "stale" },
        });
      }
      for (const item of plan.deletes) {
        await tx.chapter.deleteMany({
          where: { id: item.chapterId, novelId },
        });
      }
    });

    if (options.emitEvent !== false) {
      this.deps.emitVolumeUpdated(novelId, options.volumeUpdateReason ?? "chapter_sync");
    }
    if (options.syncPayoffLedger ?? shouldSyncPayoffLedger) {
      this.deps.syncPayoffLedger(novelId);
    }
    return plan.preview;
  }

  private assertSyncableChapterExecutionContracts(
    document: VolumePlanDocument,
    chapterRange?: VolumeSyncInput["executionContractChapterRange"],
  ): void {
    for (const volume of document.volumes) {
      for (const chapter of volume.chapters) {
        if (
          chapterRange
          && (chapter.chapterOrder < chapterRange.startOrder || chapter.chapterOrder > chapterRange.endOrder)
        ) {
          continue;
        }
        const hasExecutionArtifact = Boolean(chapter.taskSheet?.trim() || chapter.sceneCards?.trim());
        if (!hasExecutionArtifact) {
          continue;
        }
        const result = assessChapterExecutionContractShape({
          novelId: document.novelId,
          volumeId: volume.id,
          chapterId: chapter.id,
          chapterOrder: chapter.chapterOrder,
          title: chapter.title,
          summary: chapter.summary,
          purpose: chapter.purpose,
          exclusiveEvent: chapter.exclusiveEvent,
          endingState: chapter.endingState,
          nextChapterEntryState: chapter.nextChapterEntryState,
          conflictLevel: chapter.conflictLevel,
          revealLevel: chapter.revealLevel,
          targetWordCount: chapter.targetWordCount,
          mustAvoid: chapter.mustAvoid,
          payoffRefs: chapter.payoffRefs,
          taskSheet: chapter.taskSheet,
          sceneCards: chapter.sceneCards,
        });
        if (!result.canEnterExecution) {
          throw new Error(`第 ${chapter.chapterOrder} 章执行合同未通过质量门禁，不能同步到章节执行区。${formatChapterTaskSheetQualityFailure(result)}`);
        }
      }
    }
  }
}
