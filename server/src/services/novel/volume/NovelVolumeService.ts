import type {
  StorylineDiff,
  StorylineVersion,
  VolumeImpactResult,
  VolumePlan,
  VolumePlanDiff,
  VolumePlanDocument,
  VolumePlanVersion,
  VolumePlanVersionSummary,
  VolumeSyncPreview,
} from "@ai-novel/shared/types/novel";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { novelEventBus } from "../../../events";
import type { VolumeUpdateReason } from "../../../events";
import { logMemoryUsage } from "../../../runtime/memoryTelemetry";
import { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import { StyleBindingService } from "../../styleEngine/StyleBindingService";
import { ChapterExecutionContractService } from "./ChapterExecutionContractService";
import {
  hasPayoffLedgerRelevantPlanChanges,
  hasPayoffLedgerSourceSignals,
  buildVolumeDiff,
  buildVolumeDiffSummary,
  buildVolumeImpactResult,
} from "./volumePlanUtils";
import { generateVolumePlanDocument } from "./volumeGenerationOrchestrator";
import { VolumeChapterSyncService } from "./VolumeChapterSyncService";
import { getLegacyVolumeSource } from "./legacyVolumeSource";
import {
  type VolumeDraftInput,
  type VolumeGenerateOptions,
  type VolumeImpactInput,
  type VolumeSyncInput,
  mapVersionRow,
  mapVersionSummaryRow,
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
  runVolumeWorkspaceTransaction,
} from "./volumeWorkspacePersistence";
import {
  resolveVolumeGenerationTelemetryItemKey,
  resolveVolumeGenerationTelemetryStage,
  type VolumeMemoryTelemetry,
  withHighMemoryVolumeGenerationGuard,
} from "./volumeGenerationTelemetry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractVolumeWorkspaceUpdateInput(input: unknown): {
  workspaceInput: unknown;
  syncToChapterExecution: boolean;
} {
  if (!isRecord(input)) {
    return {
      workspaceInput: input,
      syncToChapterExecution: false,
    };
  }
  const { syncToChapterExecution, ...workspaceInput } = input;
  return {
    workspaceInput,
    syncToChapterExecution: syncToChapterExecution === true,
  };
}

export class NovelVolumeService {
  private readonly storyMacroPlanService = new StoryMacroPlanService();
  private readonly styleBindingService = new StyleBindingService();

  private async hydrateCanonicalChapterFields(
    novelId: string,
    document: VolumePlanDocument,
  ): Promise<{ document: VolumePlanDocument; changed: boolean }> {
    const chapterRows = await prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      select: {
        id: true,
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
    });
    if (chapterRows.length === 0) {
      return { document, changed: false };
    }

    const chapterById = new Map(chapterRows.map((row) => [row.id, row] as const));
    const chapterByOrder = new Map(chapterRows.map((row) => [row.order, row] as const));
    let changed = false;
    const volumes = document.volumes.map((volume) => {
      const chapters = volume.chapters.map((chapter) => {
        const row = chapter.chapterId
          ? chapterById.get(chapter.chapterId) ?? chapterByOrder.get(chapter.chapterOrder)
          : chapterByOrder.get(chapter.chapterOrder);
        if (!row) {
          return chapter;
        }
        const nextChapter = {
          ...chapter,
          chapterId: row.id,
          chapterOrder: row.order,
          title: row.title,
          summary: row.expectation?.trim() || chapter.summary,
          targetWordCount: row.targetWordCount ?? null,
          conflictLevel: row.conflictLevel ?? null,
          revealLevel: row.revealLevel ?? null,
          mustAvoid: row.mustAvoid ?? null,
          taskSheet: row.taskSheet ?? null,
          sceneCards: row.sceneCards ?? null,
        };
        if (JSON.stringify(nextChapter) !== JSON.stringify(chapter)) {
          changed = true;
        }
        return nextChapter;
      });
      return changed ? { ...volume, chapters } : volume;
    });

    return { document: changed ? { ...document, volumes } : document, changed };
  }

  async mirrorChapterIntoWorkspace(
    novelId: string,
    chapter: {
      id?: string | null;
      order: number;
      title: string;
      expectation?: string | null;
      targetWordCount?: number | null;
      conflictLevel?: number | null;
      revealLevel?: number | null;
      mustAvoid?: string | null;
      taskSheet?: string | null;
      sceneCards?: string | null;
    },
  ): Promise<void> {
    const document = await this.ensureVolumeWorkspace(novelId);
    let changed = false;
    const nextVolumes = document.volumes.map((volume) => {
      const chapters = volume.chapters.map((item) => {
        const matchesChapter = chapter.id
          ? item.chapterId === chapter.id || item.chapterOrder === chapter.order
          : item.chapterOrder === chapter.order;
        if (!matchesChapter) {
          return item;
        }
        changed = true;
        return {
          ...item,
          chapterId: chapter.id ?? item.chapterId ?? null,
          chapterOrder: chapter.order,
          title: chapter.title,
          summary: chapter.expectation?.trim() || item.summary,
          targetWordCount: chapter.targetWordCount ?? null,
          conflictLevel: chapter.conflictLevel ?? null,
          revealLevel: chapter.revealLevel ?? null,
          mustAvoid: chapter.mustAvoid ?? null,
          taskSheet: chapter.taskSheet ?? null,
          sceneCards: chapter.sceneCards ?? null,
        };
      });
      return changed ? { ...volume, chapters } : volume;
    });
    if (!changed) {
      return;
    }
    await this.persistWorkspaceDocument(novelId, {
      ...document,
      volumes: nextVolumes,
    }, {
      emitEvent: false,
      syncPayoffLedger: false,
    });
  }

  private emitVolumeUpdated(novelId: string, reason: VolumeUpdateReason): void {
    void novelEventBus.emit({
      type: "volume:updated",
      payload: { novelId, reason },
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
      volumeUpdateReason?: VolumeUpdateReason;
      memoryTelemetry?: VolumeMemoryTelemetry;
    } = {},
  ): Promise<VolumePlanDocument> {
    logMemoryUsage({
      event: "before_write",
      component: "persistWorkspaceDocument",
      novelId,
      taskId: options.memoryTelemetry?.taskId,
      stage: options.memoryTelemetry?.stage ?? "volume_workspace",
      itemKey: options.memoryTelemetry?.itemKey,
      scope: options.memoryTelemetry?.scope,
      entrypoint: options.memoryTelemetry?.entrypoint,
      volumeId: options.memoryTelemetry?.volumeId,
      chapterId: options.memoryTelemetry?.chapterId,
      volumeCount: document.volumes.length,
      chapterCount: document.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
      beatSheetCount: document.beatSheets.length,
    });
    const persistedDocument = await runVolumeWorkspaceTransaction(async (tx) => {
      const { versionId } = await this.ensureActiveVersionRecord(tx, novelId, document);
      const nextDocument = {
        ...document,
        activeVersionId: versionId,
        source: "volume" as const,
      };
      await persistActiveVolumeWorkspace(tx, novelId, nextDocument, versionId);
      return nextDocument;
    });
    logMemoryUsage({
      event: "after_write",
      component: "persistWorkspaceDocument",
      novelId,
      taskId: options.memoryTelemetry?.taskId,
      stage: options.memoryTelemetry?.stage ?? "volume_workspace",
      itemKey: options.memoryTelemetry?.itemKey,
      scope: options.memoryTelemetry?.scope,
      entrypoint: options.memoryTelemetry?.entrypoint,
      volumeId: options.memoryTelemetry?.volumeId,
      chapterId: options.memoryTelemetry?.chapterId,
      volumeCount: persistedDocument.volumes.length,
      chapterCount: persistedDocument.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
      beatSheetCount: persistedDocument.beatSheets.length,
    });

    if (options.emitEvent !== false) {
      this.emitVolumeUpdated(novelId, options.volumeUpdateReason ?? "workspace_updated");
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

  private async ensureVolumeWorkspace(novelId: string): Promise<VolumePlanDocument> {
    const document = await ensureVolumeWorkspaceDocument({
      novelId,
      getLegacySource: () => getLegacyVolumeSource(novelId),
    });
    const hydrated = await this.hydrateCanonicalChapterFields(novelId, document);
    if (!hydrated.changed) {
      return hydrated.document;
    }
    return this.persistWorkspaceDocument(novelId, hydrated.document, {
      emitEvent: false,
      syncPayoffLedger: false,
      volumeUpdateReason: "chapter_sync",
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
    const { workspaceInput, syncToChapterExecution } = extractVolumeWorkspaceUpdateInput(input);
    return this.updateVolumesWithOptions(novelId, workspaceInput, {
      syncToChapterExecution,
    });
  }

  async updateVolumesWithOptions(
    novelId: string,
    input: unknown,
    options: {
      volumeUpdateReason?: VolumeUpdateReason;
      syncPayoffLedger?: boolean;
      syncToChapterExecution?: boolean;
      emitEvent?: boolean;
      memoryTelemetry?: VolumeMemoryTelemetry;
    } = {},
  ): Promise<VolumePlanDocument> {
    const currentDocument = await this.ensureVolumeWorkspace(novelId);
    const mergedDocument = mergeVolumeWorkspaceInput(novelId, currentDocument, input);
    const persistedDocument = await this.persistWorkspaceDocument(novelId, mergedDocument, {
      volumeUpdateReason: options.volumeUpdateReason,
      emitEvent: options.emitEvent,
      syncPayoffLedger: options.syncPayoffLedger
        ?? hasPayoffLedgerRelevantPlanChanges(currentDocument.volumes, mergedDocument.volumes),
      memoryTelemetry: options.memoryTelemetry,
    });
    if (options.syncToChapterExecution) {
      try {
        await this.syncVolumeChaptersWithOptions(novelId, {
          volumes: persistedDocument.volumes,
          preserveContent: true,
          applyDeletes: false,
        }, {
          emitEvent: false,
          syncPayoffLedger: false,
        });
        return this.ensureVolumeWorkspace(novelId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        throw new Error(`当前卷工作区已保存，但章节执行连接失败：${message}`);
      }
    }
    return persistedDocument;
  }

  async listVolumeVersions(novelId: string): Promise<VolumePlanVersionSummary[]> {
    await this.ensureVolumeWorkspace(novelId);
    const rows = await prisma.volumePlanVersion.findMany({
      where: { novelId },
      select: {
        id: true,
        novelId: true,
        version: true,
        status: true,
        diffSummary: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ version: "desc" }],
    });
    return rows.map(mapVersionSummaryRow);
  }

  private async listVolumeVersionsWithContent(novelId: string): Promise<VolumePlanVersion[]> {
    await this.ensureVolumeWorkspace(novelId);
    const rows = await prisma.volumePlanVersion.findMany({
      where: { novelId },
      orderBy: [{ version: "desc" }],
    });
    return rows.map(mapVersionRow);
  }

  async getVolumeVersion(novelId: string, versionId: string): Promise<VolumePlanVersion> {
    await this.ensureVolumeWorkspace(novelId);
    const row = await prisma.volumePlanVersion.findFirst({
      where: { id: versionId, novelId },
    });
    if (!row) {
      throw new Error("卷级版本不存在。");
    }
    return mapVersionRow(row);
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
    await runVolumeWorkspaceTransaction(async (tx) => {
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
    this.emitVolumeUpdated(novelId, "version_activated");
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
    return this.syncVolumeChaptersWithOptions(novelId, input);
  }

  async syncVolumeChaptersWithOptions(
    novelId: string,
    input: VolumeSyncInput,
    options: {
      emitEvent?: boolean;
      syncPayoffLedger?: boolean;
      volumeUpdateReason?: VolumeUpdateReason;
    } = {},
  ): Promise<VolumeSyncPreview> {
    return new VolumeChapterSyncService({
      ensureVolumeWorkspace: (targetNovelId) => this.ensureVolumeWorkspace(targetNovelId),
      ensureActiveVersionRecord: (tx, targetNovelId, document, diffSummary) => (
        this.ensureActiveVersionRecord(tx, targetNovelId, document, diffSummary)
      ),
      emitVolumeUpdated: (targetNovelId, reason) => this.emitVolumeUpdated(targetNovelId, reason),
      syncPayoffLedger: (targetNovelId) => this.syncPayoffLedger(targetNovelId),
    }).syncVolumeChaptersWithOptions(novelId, input, options);
  }

  async ensureChapterExecutionContract(
    novelId: string,
    chapterId: string,
    options: Pick<
      VolumeGenerateOptions,
      "provider" | "model" | "temperature" | "guidance" | "chapterTaskSheetQualityMode" | "entrypoint" | "taskId" | "signal"
    > & {
      taskStyleProfileId?: string;
    } = {},
  ) {
    return new ChapterExecutionContractService({
      storyMacroPlanService: this.storyMacroPlanService,
      styleBindingService: this.styleBindingService,
      ensureVolumeWorkspace: (targetNovelId) => this.ensureVolumeWorkspace(targetNovelId),
      findVolumeChapterMatch: (workspace, chapter) => this.findVolumeChapterMatch(workspace, chapter),
      ensureActiveVersionRecord: (tx, targetNovelId, document, diffSummary) => (
        this.ensureActiveVersionRecord(tx, targetNovelId, document, diffSummary)
      ),
      emitVolumeUpdated: (targetNovelId, reason) => this.emitVolumeUpdated(targetNovelId, reason),
    }).ensureChapterExecutionContract(novelId, chapterId, options);
  }

  async migrateLegacyVolumes(novelId: string): Promise<VolumePlanDocument> {
    const workspace = await this.ensureVolumeWorkspace(novelId);
    this.emitVolumeUpdated(novelId, "legacy_migration");
    if (workspace.source === "legacy" && hasPayoffLedgerSourceSignals(workspace.volumes)) {
      this.syncPayoffLedger(novelId);
    }
    return workspace;
  }

  async generateVolumes(novelId: string, options: VolumeGenerateOptions = {}): Promise<VolumePlanDocument> {
    return withHighMemoryVolumeGenerationGuard(novelId, options, async () => {
      const persistedWorkspace = await this.ensureVolumeWorkspace(novelId);
      const workspace = options.draftWorkspace
        ? mergeVolumeWorkspaceInput(novelId, persistedWorkspace, options.draftWorkspace)
        : options.draftVolumes
          ? mergeVolumeWorkspaceInput(novelId, persistedWorkspace, { volumes: options.draftVolumes })
          : persistedWorkspace;
      logMemoryUsage({
        event: "before_generate",
        component: "generateVolumes",
        novelId,
        taskId: options.taskId,
        stage: resolveVolumeGenerationTelemetryStage(options),
        itemKey: resolveVolumeGenerationTelemetryItemKey(options),
        scope: options.scope ?? "strategy",
        entrypoint: options.entrypoint,
        volumeId: options.targetVolumeId,
        chapterId: options.targetChapterId,
        volumeCount: workspace.volumes.length,
        chapterCount: workspace.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
        beatSheetCount: workspace.beatSheets.length,
      });
      const generatedDocument = await generateVolumePlanDocument({
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
              const shouldPersistIntermediate = event.isFinal !== false || options.persistIntermediateDocuments === true;
              const persistedDocument = shouldPersistIntermediate
                ? await this.persistWorkspaceDocument(novelId, event.document, {
                  emitEvent: false,
                  syncPayoffLedger: false,
                  memoryTelemetry: {
                    taskId: options.taskId,
                    stage: resolveVolumeGenerationTelemetryStage(options),
                    itemKey: event.scope === "chapter_detail" ? "chapter_detail_bundle" : event.scope,
                    scope: event.scope,
                    entrypoint: options.entrypoint,
                    volumeId: event.targetVolumeId ?? options.targetVolumeId,
                    chapterId: options.targetChapterId,
                  },
                })
                : event.document;
              await options.onIntermediateDocument?.({
                ...event,
                document: persistedDocument,
              });
            }
            : undefined,
        },
        storyMacroPlanService: this.storyMacroPlanService,
      });
      logMemoryUsage({
        event: "before_return",
        component: "generateVolumes",
        novelId,
        taskId: options.taskId,
        stage: resolveVolumeGenerationTelemetryStage(options),
        itemKey: resolveVolumeGenerationTelemetryItemKey(options),
        scope: options.scope ?? "strategy",
        entrypoint: options.entrypoint,
        volumeId: options.targetVolumeId,
        chapterId: options.targetChapterId,
        volumeCount: generatedDocument.volumes.length,
        chapterCount: generatedDocument.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
        beatSheetCount: generatedDocument.beatSheets.length,
      });
      return generatedDocument;
    });
  }

  async listStorylineVersionsCompat(novelId: string): Promise<StorylineVersion[]> {
    return listStorylineVersionsCompat({
      novelId,
      listVolumeVersions: () => this.listVolumeVersionsWithContent(novelId),
      parseVersionContent: (contentJson) => this.parseVersionContent(novelId, contentJson),
    });
  }

  async createStorylineDraftCompat(novelId: string, input: { content: string; diffSummary?: string; baseVersion?: number }) {
    return createStorylineDraftCompat(
      {
        novelId,
        getLegacySource: () => getLegacyVolumeSource(novelId),
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
        getLegacySource: () => getLegacyVolumeSource(novelId),
        analyzeVolumeImpact: (impactInput) => this.analyzeVolumeImpact(novelId, impactInput),
      },
      input,
    );
  }
}
