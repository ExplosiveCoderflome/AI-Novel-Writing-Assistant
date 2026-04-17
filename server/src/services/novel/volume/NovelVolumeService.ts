import type {
  StorylineDiff,
  StorylineVersion,
  VolumeImpactResult,
  VolumePlan,
  VolumePlanDiff,
  VolumePlanDocument,
  VolumePlanVersion,
  VolumeSyncPreview,
} from "@ai-novel/shared/types/novel";
import {
  parseChapterScenePlan,
  serializeChapterScenePlan,
} from "@ai-novel/shared/types/chapterLengthControl";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { novelEventBus } from "../../../events";
import { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import {
  buildTaskSheetFromVolumeChapter,
  hasPayoffLedgerRelevantPlanChanges,
  hasPayoffLedgerSourceSignals,
  buildVolumeDiff,
  buildVolumeDiffSummary,
  buildVolumeImpactResult,
  buildVolumeSyncPlan,
  type ExistingChapterRecord,
  type LegacyVolumeSource,
} from "./volumePlanUtils";
import { generateVolumePlanDocument } from "./volumeGenerationOrchestrator";
import {
  type VolumeDraftInput,
  type VolumeGenerateOptions,
  type VolumeImpactInput,
  type VolumeSyncInput,
  mapVersionRow,
} from "./volumeModels";
import {
  activateStorylineVersionCompat,
  analyzeStorylineImpactCompat,
  createStorylineDraftCompat,
  freezeStorylineVersionCompat,
  getStorylineDiffCompat,
  listStorylineVersionsCompat,
} from "./volumeStorylineCompat";
import {
  buildVolumeWorkspaceDocument,
  mergeVolumeWorkspaceInput,
  normalizeVolumeWorkspaceDocument,
  serializeVolumeWorkspaceDocument,
} from "./volumeWorkspaceDocument";
import {
  ensureVolumeWorkspaceDocument,
  getActiveVersionRow,
  getLatestVersionRow,
  persistActiveVolumeWorkspace,
} from "./volumeWorkspacePersistence";

export class NovelVolumeService {
  private readonly storyMacroPlanService = new StoryMacroPlanService();

  private emitVolumeUpdated(novelId: string): void {
    void novelEventBus.emit({
      type: "volume:updated",
      payload: { novelId },
    }).catch(() => {});
  }

  private syncPayoffLedger(novelId: string): void {
    void payoffLedgerSyncService.syncLedger(novelId).catch(() => null);
  }

  private async persistWorkspaceDocument(
    novelId: string,
    document: VolumePlanDocument,
    options: {
      emitEvent?: boolean;
      syncPayoffLedger?: boolean;
    } = {},
  ): Promise<VolumePlanDocument> {
    const persistedDocument = await prisma.$transaction(async (tx) => {
      const { versionId } = await this.ensureActiveVersionRecord(tx, novelId, document);
      const nextDocument = {
        ...document,
        activeVersionId: versionId,
        source: "volume" as const,
      };
      await tx.volumePlanVersion.update({
        where: { id: versionId },
        data: {
          contentJson: serializeVolumeWorkspaceDocument(nextDocument),
        },
      });
      await persistActiveVolumeWorkspace(tx, novelId, nextDocument, versionId);
      return nextDocument;
    });

    if (options.emitEvent !== false) {
      this.emitVolumeUpdated(novelId);
    }
    if (options.syncPayoffLedger !== false) {
      this.syncPayoffLedger(novelId);
    }
    return persistedDocument;
  }

  private parseVersionDocument(novelId: string, contentJson: string): VolumePlanDocument {
    return normalizeVolumeWorkspaceDocument(novelId, contentJson, {
      source: "volume",
      activeVersionId: null,
    });
  }

  private parseVersionContent(novelId: string, contentJson: string): VolumePlan[] {
    return this.parseVersionDocument(novelId, contentJson).volumes;
  }

  private async getLegacySource(novelId: string): Promise<LegacyVolumeSource> {
    const [novel, arcPlans] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          id: true,
          outline: true,
          structuredOutline: true,
          estimatedChapterCount: true,
          chapters: {
            orderBy: { order: "asc" },
            select: {
              order: true,
              title: true,
              expectation: true,
              targetWordCount: true,
              conflictLevel: true,
              revealLevel: true,
              mustAvoid: true,
              taskSheet: true,
              sceneCards: true,
            },
          },
        },
      }),
      prisma.storyPlan.findMany({
        where: { novelId, level: "arc" },
        orderBy: [{ createdAt: "asc" }],
        select: {
          externalRef: true,
          title: true,
          objective: true,
          phaseLabel: true,
          hookTarget: true,
          rawPlanJson: true,
        },
      }),
    ]);
    if (!novel) {
      throw new Error("小说不存在。");
    }
    return {
      outline: novel.outline,
      structuredOutline: novel.structuredOutline,
      estimatedChapterCount: novel.estimatedChapterCount,
      chapters: novel.chapters,
      arcPlans,
    };
  }

  private async ensureVolumeWorkspace(novelId: string): Promise<VolumePlanDocument> {
    return ensureVolumeWorkspaceDocument({
      novelId,
      getLegacySource: () => this.getLegacySource(novelId),
    });
  }

  private findVolumeChapterMatch(
    workspace: VolumePlanDocument,
    chapter: {
      order: number;
      title: string;
    },
  ): { volumeId: string; volumeChapterId: string } {
    for (const volume of workspace.volumes) {
      const matchedChapter = volume.chapters.find((item) => item.chapterOrder === chapter.order)
        ?? volume.chapters.find((item) => item.title.trim() === chapter.title.trim());
      if (matchedChapter) {
        return {
          volumeId: volume.id,
          volumeChapterId: matchedChapter.id,
        };
      }
    }
    throw new Error("当前章节未映射到卷规划章节，无法生成执行合同。");
  }

  private async ensureActiveVersionRecord(
    tx: Prisma.TransactionClient,
    novelId: string,
    document: VolumePlanDocument,
    diffSummary?: string,
  ): Promise<{ versionId: string; version: number }> {
    const activeVersion = await getActiveVersionRow(novelId, tx);
    if (activeVersion) {
      const persistedDocument = {
        ...document,
        activeVersionId: activeVersion.id,
        source: "volume" as const,
      };
      const updated = await tx.volumePlanVersion.update({
        where: { id: activeVersion.id },
        data: {
          contentJson: serializeVolumeWorkspaceDocument(persistedDocument),
          diffSummary: diffSummary ?? activeVersion.diffSummary,
        },
      });
      return {
        versionId: updated.id,
        version: updated.version,
      };
    }

    const latestVersion = await getLatestVersionRow(novelId, tx);
    const created = await tx.volumePlanVersion.create({
      data: {
        novelId,
        version: (latestVersion?.version ?? 0) + 1,
        status: "active",
        contentJson: "{}",
        diffSummary: diffSummary ?? "同步当前卷工作区。",
      },
    });
    const persistedDocument = {
      ...document,
      activeVersionId: created.id,
      source: "volume" as const,
    };
    await tx.volumePlanVersion.update({
      where: { id: created.id },
      data: {
        contentJson: serializeVolumeWorkspaceDocument(persistedDocument),
      },
    });
    return {
      versionId: created.id,
      version: created.version,
    };
  }

  async getVolumes(novelId: string): Promise<VolumePlanDocument> {
    return this.ensureVolumeWorkspace(novelId);
  }

  async updateVolumes(novelId: string, input: unknown): Promise<VolumePlanDocument> {
    const currentDocument = await this.ensureVolumeWorkspace(novelId);
    const mergedDocument = mergeVolumeWorkspaceInput(novelId, currentDocument, input);
    return this.persistWorkspaceDocument(novelId, mergedDocument, {
      syncPayoffLedger: hasPayoffLedgerRelevantPlanChanges(currentDocument.volumes, mergedDocument.volumes),
    });
  }

  async listVolumeVersions(novelId: string): Promise<VolumePlanVersion[]> {
    await this.ensureVolumeWorkspace(novelId);
    const rows = await prisma.volumePlanVersion.findMany({
      where: { novelId },
      orderBy: [{ version: "desc" }],
    });
    return rows.map(mapVersionRow);
  }

  async createVolumeDraft(novelId: string, input: VolumeDraftInput): Promise<VolumePlanVersion> {
    const workspace = await this.ensureVolumeWorkspace(novelId);
    const latestVersion = await getLatestVersionRow(novelId);
    const baseVersion = typeof input.baseVersion === "number"
      ? await prisma.volumePlanVersion.findFirst({
        where: { novelId, version: input.baseVersion },
      })
      : null;
    const nextDocument = mergeVolumeWorkspaceInput(novelId, workspace, input);
    const previousDocument = baseVersion
      ? this.parseVersionDocument(novelId, baseVersion.contentJson)
      : workspace;
    const diffSummary = input.diffSummary?.trim() || buildVolumeDiffSummary(
      buildVolumeDiff(previousDocument.volumes, nextDocument.volumes, {
        id: "draft",
        novelId,
        version: (latestVersion?.version ?? 0) + 1,
        status: "draft",
      }).changedVolumes,
    );
    const created = await prisma.volumePlanVersion.create({
      data: {
        novelId,
        version: (latestVersion?.version ?? 0) + 1,
        status: "draft",
        contentJson: serializeVolumeWorkspaceDocument({
          ...nextDocument,
          activeVersionId: workspace.activeVersionId,
        }),
        diffSummary,
      },
    });
    return mapVersionRow(created);
  }

  async activateVolumeVersion(novelId: string, versionId: string): Promise<VolumePlanVersion> {
    const currentDocument = await this.ensureVolumeWorkspace(novelId);
    const target = await prisma.volumePlanVersion.findFirst({
      where: { id: versionId, novelId },
    });
    if (!target) {
      throw new Error("卷级版本不存在。");
    }
    const document = this.parseVersionDocument(novelId, target.contentJson);
    if (document.volumes.length === 0) {
      throw new Error("卷级版本内容为空。");
    }
    await prisma.$transaction(async (tx) => {
      await tx.volumePlanVersion.updateMany({
        where: { novelId, status: "active" },
        data: { status: "frozen" },
      });
      const activatedDocument = {
        ...document,
        activeVersionId: target.id,
        source: "volume" as const,
      };
      await tx.volumePlanVersion.update({
        where: { id: target.id },
        data: {
          status: "active",
          contentJson: serializeVolumeWorkspaceDocument(activatedDocument),
        },
      });
      await persistActiveVolumeWorkspace(tx, novelId, activatedDocument, target.id);
    });
    const refreshed = await prisma.volumePlanVersion.findUnique({ where: { id: target.id } });
    if (!refreshed) {
      throw new Error("卷级版本激活失败。");
    }
    const shouldSyncPayoffLedger = hasPayoffLedgerRelevantPlanChanges(currentDocument.volumes, document.volumes);
    this.emitVolumeUpdated(novelId);
    if (shouldSyncPayoffLedger) {
      this.syncPayoffLedger(novelId);
    }
    return mapVersionRow(refreshed);
  }

  async freezeVolumeVersion(novelId: string, versionId: string): Promise<VolumePlanVersion> {
    const target = await prisma.volumePlanVersion.findFirst({
      where: { id: versionId, novelId },
      select: { id: true },
    });
    if (!target) {
      throw new Error("卷级版本不存在。");
    }
    const row = await prisma.volumePlanVersion.update({
      where: { id: target.id },
      data: { status: "frozen" },
    });
    return mapVersionRow(row);
  }

  async getVolumeDiff(novelId: string, versionId: string, compareVersion?: number): Promise<VolumePlanDiff> {
    await this.ensureVolumeWorkspace(novelId);
    const target = await prisma.volumePlanVersion.findFirst({
      where: { id: versionId, novelId },
    });
    if (!target) {
      throw new Error("卷级版本不存在。");
    }
    let baseline: VolumePlan[] = [];
    if (typeof compareVersion === "number") {
      const compareRow = await prisma.volumePlanVersion.findFirst({
        where: { novelId, version: compareVersion },
      });
      baseline = compareRow ? this.parseVersionContent(novelId, compareRow.contentJson) : [];
    } else {
      const previousRow = await prisma.volumePlanVersion.findFirst({
        where: { novelId, version: { lt: target.version } },
        orderBy: { version: "desc" },
      });
      baseline = previousRow ? this.parseVersionContent(novelId, previousRow.contentJson) : [];
    }
    const candidate = this.parseVersionContent(novelId, target.contentJson);
    return buildVolumeDiff(baseline, candidate, {
      id: target.id,
      novelId,
      version: target.version,
      status: target.status,
      diffSummary: target.diffSummary,
    });
  }

  async analyzeVolumeImpact(novelId: string, input: VolumeImpactInput): Promise<VolumeImpactResult> {
    const workspace = await this.ensureVolumeWorkspace(novelId);
    let candidateVolumes = input.volumes
      ? mergeVolumeWorkspaceInput(novelId, workspace, { volumes: input.volumes }).volumes
      : workspace.volumes;
    let sourceVersion: number | null = null;

    if (!input.volumes && input.versionId) {
      const version = await prisma.volumePlanVersion.findFirst({
        where: { id: input.versionId, novelId },
      });
      if (!version) {
        throw new Error("卷级版本不存在。");
      }
      candidateVolumes = this.parseVersionContent(novelId, version.contentJson);
      sourceVersion = version.version;
    }

    return buildVolumeImpactResult(novelId, workspace.volumes, candidateVolumes, sourceVersion);
  }

  async syncVolumeChapters(novelId: string, input: VolumeSyncInput): Promise<VolumeSyncPreview> {
    const workspace = await this.ensureVolumeWorkspace(novelId);
    const mergedDocument = mergeVolumeWorkspaceInput(novelId, workspace, { volumes: input.volumes });
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

    await prisma.$transaction(async (tx) => {
      const { versionId } = await this.ensureActiveVersionRecord(tx, novelId, mergedDocument);
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
        const taskSheet = item.chapter.taskSheet?.trim() || buildTaskSheetFromVolumeChapter(item.chapter);
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
            taskSheet,
            sceneCards: item.chapter.sceneCards ?? null,
          },
        });
      }
      for (const item of plan.updates) {
        const taskSheet = item.chapter.taskSheet?.trim() || buildTaskSheetFromVolumeChapter(item.chapter);
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
            taskSheet,
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

    this.emitVolumeUpdated(novelId);
    if (shouldSyncPayoffLedger) {
      this.syncPayoffLedger(novelId);
    }
    return plan.preview;
  }

  async ensureChapterExecutionContract(
    novelId: string,
    chapterId: string,
    options: Pick<VolumeGenerateOptions, "provider" | "model" | "temperature" | "guidance"> = {},
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
    if (chapter.taskSheet?.trim() && existingScenePlan) {
      return chapter;
    }

    const workspace = await this.ensureVolumeWorkspace(novelId);
    const matched = this.findVolumeChapterMatch(workspace, {
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
      },
      storyMacroPlanService: this.storyMacroPlanService,
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

    const persistedChapter = await prisma.$transaction(async (tx) => {
      const { versionId } = await this.ensureActiveVersionRecord(
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
      return tx.chapter.update({
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
    });

    this.emitVolumeUpdated(novelId);
    // Task sheet / scene card refresh should not re-run payoff ledger sync.
    return persistedChapter;
  }

  async migrateLegacyVolumes(novelId: string): Promise<VolumePlanDocument> {
    const workspace = await this.ensureVolumeWorkspace(novelId);
    this.emitVolumeUpdated(novelId);
    if (workspace.source === "legacy" && hasPayoffLedgerSourceSignals(workspace.volumes)) {
      this.syncPayoffLedger(novelId);
    }
    return workspace;
  }

  async generateVolumes(novelId: string, options: VolumeGenerateOptions = {}): Promise<VolumePlanDocument> {
    const persistedWorkspace = await this.ensureVolumeWorkspace(novelId);
    const workspace = options.draftWorkspace
      ? mergeVolumeWorkspaceInput(novelId, persistedWorkspace, options.draftWorkspace)
      : options.draftVolumes
        ? mergeVolumeWorkspaceInput(novelId, persistedWorkspace, { volumes: options.draftVolumes })
        : persistedWorkspace;
    return generateVolumePlanDocument({
      novelId,
      workspace,
      options: {
        ...options,
        onIntermediateDocument: (
          options.onIntermediateDocument
          || options.scope === "chapter_list"
          || options.scope === "volume"
        )
          ? async (event) => {
            const persistedDocument = await this.persistWorkspaceDocument(novelId, event.document, {
              emitEvent: false,
              syncPayoffLedger: false,
            });
            await options.onIntermediateDocument?.({
              ...event,
              document: persistedDocument,
            });
          }
          : undefined,
      },
      storyMacroPlanService: this.storyMacroPlanService,
    });
  }

  async listStorylineVersionsCompat(novelId: string): Promise<StorylineVersion[]> {
    return listStorylineVersionsCompat({
      novelId,
      listVolumeVersions: () => this.listVolumeVersions(novelId),
      parseVersionContent: (contentJson) => this.parseVersionContent(novelId, contentJson),
    });
  }

  async createStorylineDraftCompat(novelId: string, input: { content: string; diffSummary?: string; baseVersion?: number }) {
    return createStorylineDraftCompat(
      {
        novelId,
        getLegacySource: () => this.getLegacySource(novelId),
        createVolumeDraft: (draftInput) => this.createVolumeDraft(novelId, draftInput),
      },
      input,
    );
  }

  async activateStorylineVersionCompat(novelId: string, versionId: string): Promise<StorylineVersion> {
    return activateStorylineVersionCompat(
      {
        novelId,
        activateVolumeVersion: (targetVersionId) => this.activateVolumeVersion(novelId, targetVersionId),
        parseVersionContent: (contentJson) => this.parseVersionContent(novelId, contentJson),
      },
      versionId,
    );
  }

  async freezeStorylineVersionCompat(novelId: string, versionId: string): Promise<StorylineVersion> {
    return freezeStorylineVersionCompat(
      {
        novelId,
        freezeVolumeVersion: (targetVersionId) => this.freezeVolumeVersion(novelId, targetVersionId),
        parseVersionContent: (contentJson) => this.parseVersionContent(novelId, contentJson),
      },
      versionId,
    );
  }

  async getStorylineDiffCompat(novelId: string, versionId: string, compareVersion?: number): Promise<StorylineDiff> {
    return getStorylineDiffCompat(
      {
        getVolumeDiff: (targetVersionId, targetCompareVersion) => this.getVolumeDiff(novelId, targetVersionId, targetCompareVersion),
      },
      novelId,
      versionId,
      compareVersion,
    );
  }

  async analyzeStorylineImpactCompat(novelId: string, input: { content?: string; versionId?: string }) {
    return analyzeStorylineImpactCompat(
      {
        novelId,
        getLegacySource: () => this.getLegacySource(novelId),
        analyzeVolumeImpact: (impactInput) => this.analyzeVolumeImpact(novelId, impactInput),
      },
      input,
    );
  }
}
