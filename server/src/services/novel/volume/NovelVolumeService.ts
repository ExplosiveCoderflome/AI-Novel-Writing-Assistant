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
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { novelEventBus } from "../../../events";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import {
  buildDerivedOutlineFromVolumes,
  buildDerivedStructuredOutlineFromVolumes,
  buildFallbackVolumesFromLegacy,
  buildTaskSheetFromVolumeChapter,
  buildVolumeDiff,
  buildVolumeDiffSummary,
  buildVolumeImpactResult,
  buildVolumeSyncPlan,
  normalizeVolumeDraftInput,
  type ExistingChapterRecord,
  type LegacyVolumeSource,
} from "./volumePlanUtils";
import { normalizeVolumeDraftContextInput } from "./volumeDraftContext";
import { generateVolumePlanDocument } from "./volumeGeneration";
import {
  type DbClient,
  mapVersionRow,
  mapVolumeRow,
  type VolumeDraftInput,
  type VolumeGenerateOptions,
  type VolumeImpactInput,
  type VolumeSyncInput,
} from "./volumeModels";
import {
  activateStorylineVersionCompat,
  analyzeStorylineImpactCompat,
  createStorylineDraftCompat,
  freezeStorylineVersionCompat,
  getStorylineDiffCompat,
  listStorylineVersionsCompat,
} from "./volumeStorylineCompat";

export class NovelVolumeService {
  private readonly storyMacroPlanService = new StoryMacroPlanService();

  private emitVolumeUpdated(novelId: string): void {
    void novelEventBus.emit({
      type: "volume:updated",
      payload: { novelId },
    }).catch(() => {});
  }

  private serializeVersionContent(novelId: string, volumes: VolumePlan[]): string {
    return JSON.stringify({
      novelId,
      volumes: volumes.map((volume) => ({
        sortOrder: volume.sortOrder,
        title: volume.title,
        summary: volume.summary ?? null,
        mainPromise: volume.mainPromise ?? null,
        escalationMode: volume.escalationMode ?? null,
        protagonistChange: volume.protagonistChange ?? null,
        climax: volume.climax ?? null,
        nextVolumeHook: volume.nextVolumeHook ?? null,
        resetPoint: volume.resetPoint ?? null,
        openPayoffs: volume.openPayoffs,
        chapters: volume.chapters.map((chapter) => ({
          chapterOrder: chapter.chapterOrder,
          title: chapter.title,
          summary: chapter.summary,
          purpose: chapter.purpose ?? null,
          conflictLevel: chapter.conflictLevel ?? null,
          revealLevel: chapter.revealLevel ?? null,
          targetWordCount: chapter.targetWordCount ?? null,
          mustAvoid: chapter.mustAvoid ?? null,
          taskSheet: chapter.taskSheet ?? null,
          payoffRefs: chapter.payoffRefs,
        })),
      })),
    });
  }

  private parseVersionContent(novelId: string, contentJson: string): VolumePlan[] {
    try {
      const parsed = JSON.parse(contentJson) as { volumes?: unknown };
      return normalizeVolumeDraftInput(novelId, parsed.volumes ?? []);
    } catch {
      return [];
    }
  }

  private async listActiveVolumeRows(novelId: string, db: DbClient = prisma): Promise<VolumePlan[]> {
    const rows = await db.volumePlan.findMany({
      where: { novelId },
      include: {
        chapters: {
          orderBy: { chapterOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(mapVolumeRow);
  }

  private async getActiveVersionRow(novelId: string, db: DbClient = prisma) {
    return db.volumePlanVersion.findFirst({
      where: { novelId, status: "active" },
      orderBy: [{ version: "desc" }],
    });
  }

  private async getLatestVersionRow(novelId: string, db: DbClient = prisma) {
    return db.volumePlanVersion.findFirst({
      where: { novelId },
      orderBy: [{ version: "desc" }],
    });
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

  private async syncArcCompatibility(tx: Prisma.TransactionClient, novelId: string, volumes: VolumePlan[]) {
    const externalRefs = volumes.map((volume) => `volume:${volume.sortOrder}`);
    await tx.storyPlan.deleteMany({
      where: {
        novelId,
        level: "arc",
        externalRef: {
          startsWith: "volume:",
          notIn: externalRefs,
        },
      },
    });
    for (const volume of volumes) {
      const externalRef = `volume:${volume.sortOrder}`;
      const existing = await tx.storyPlan.findFirst({
        where: { novelId, level: "arc", externalRef },
        select: { id: true },
      });
      const payload = {
        title: volume.title,
        objective: volume.mainPromise ?? volume.summary ?? `推进第${volume.sortOrder}卷主线。`,
        phaseLabel: volume.escalationMode ?? null,
        hookTarget: volume.nextVolumeHook ?? null,
        rawPlanJson: JSON.stringify({
          volumeTitle: volume.title,
          summary: volume.summary,
          mainPromise: volume.mainPromise,
          escalationMode: volume.escalationMode,
          protagonistChange: volume.protagonistChange,
          climax: volume.climax,
          nextVolumeHook: volume.nextVolumeHook,
          resetPoint: volume.resetPoint,
          openPayoffs: volume.openPayoffs,
          chapters: volume.chapters.map((chapter) => ({
            chapterOrder: chapter.chapterOrder,
            title: chapter.title,
            summary: chapter.summary,
          })),
        }),
        revealsJson: volume.openPayoffs.length > 0 ? JSON.stringify(volume.openPayoffs) : null,
        mustAdvanceJson: JSON.stringify(volume.chapters.map((chapter) => `第${chapter.chapterOrder}章 ${chapter.title}`)),
        status: "active",
        externalRef,
      };
      if (existing) {
        await tx.storyPlan.update({
          where: { id: existing.id },
          data: payload,
        });
      } else {
        await tx.storyPlan.create({
          data: {
            novelId,
            level: "arc",
            ...payload,
          },
        });
      }
    }
  }

  private async persistActiveVolumes(
    tx: Prisma.TransactionClient,
    novelId: string,
    volumes: VolumePlan[],
    sourceVersionId: string | null,
  ) {
    await tx.volumePlan.deleteMany({ where: { novelId } });
    for (const volume of volumes) {
      await tx.volumePlan.create({
        data: {
          id: volume.id,
          novelId,
          sortOrder: volume.sortOrder,
          title: volume.title,
          summary: volume.summary ?? null,
          mainPromise: volume.mainPromise ?? null,
          escalationMode: volume.escalationMode ?? null,
          protagonistChange: volume.protagonistChange ?? null,
          climax: volume.climax ?? null,
          nextVolumeHook: volume.nextVolumeHook ?? null,
          resetPoint: volume.resetPoint ?? null,
          openPayoffsJson: JSON.stringify(volume.openPayoffs),
          status: volume.status,
          sourceVersionId,
          chapters: {
            create: volume.chapters.map((chapter) => ({
              id: chapter.id,
              chapterOrder: chapter.chapterOrder,
              title: chapter.title,
              summary: chapter.summary,
              purpose: chapter.purpose ?? null,
              conflictLevel: chapter.conflictLevel ?? null,
              revealLevel: chapter.revealLevel ?? null,
              targetWordCount: chapter.targetWordCount ?? null,
              mustAvoid: chapter.mustAvoid ?? null,
              taskSheet: chapter.taskSheet ?? null,
              payoffRefsJson: JSON.stringify(chapter.payoffRefs),
            })),
          },
        },
      });
    }

    await tx.novel.update({
      where: { id: novelId },
      data: {
        outline: buildDerivedOutlineFromVolumes(volumes),
        structuredOutline: buildDerivedStructuredOutlineFromVolumes(volumes),
        storylineStatus: volumes.length > 0 ? "in_progress" : undefined,
        outlineStatus: volumes.length > 0 ? "in_progress" : undefined,
      },
    });
    await this.syncArcCompatibility(tx, novelId, volumes);
  }

  private async ensureVolumeWorkspace(novelId: string): Promise<{ volumes: VolumePlan[]; source: "volume" | "legacy" | "empty"; activeVersionId: string | null }> {
    const existingVolumes = await this.listActiveVolumeRows(novelId);
    if (existingVolumes.length > 0) {
      const activeVersion = await this.getActiveVersionRow(novelId);
      return {
        volumes: existingVolumes,
        source: "volume",
        activeVersionId: activeVersion?.id ?? null,
      };
    }

    const latestVersion = await this.getLatestVersionRow(novelId);
    if (latestVersion) {
      const volumes = this.parseVersionContent(novelId, latestVersion.contentJson);
      if (volumes.length > 0) {
        await prisma.$transaction(async (tx) => {
          await this.persistActiveVolumes(tx, novelId, volumes, latestVersion.id);
          if (latestVersion.status !== "active") {
            await tx.volumePlanVersion.update({
              where: { id: latestVersion.id },
              data: { status: "active" },
            });
          }
        });
        return {
          volumes,
          source: "volume",
          activeVersionId: latestVersion.id,
        };
      }
    }

    const legacySource = await this.getLegacySource(novelId);
    const migratedVolumes = buildFallbackVolumesFromLegacy(novelId, legacySource);
    if (migratedVolumes.length === 0) {
      return {
        volumes: [],
        source: "empty",
        activeVersionId: null,
      };
    }

    const createdVersion = await prisma.$transaction(async (tx) => {
      const version = await tx.volumePlanVersion.create({
        data: {
          novelId,
          version: 1,
          status: "active",
          contentJson: this.serializeVersionContent(novelId, migratedVolumes),
          diffSummary: "从旧版主线/大纲自动回填为卷级方案。",
        },
      });
      await this.persistActiveVolumes(tx, novelId, migratedVolumes, version.id);
      return version;
    });

    return {
      volumes: migratedVolumes,
      source: "legacy",
      activeVersionId: createdVersion.id,
    };
  }

  async getVolumes(novelId: string): Promise<VolumePlanDocument> {
    const workspace = await this.ensureVolumeWorkspace(novelId);
    return {
      novelId,
      volumes: workspace.volumes,
      derivedOutline: buildDerivedOutlineFromVolumes(workspace.volumes),
      derivedStructuredOutline: buildDerivedStructuredOutlineFromVolumes(workspace.volumes),
      source: workspace.source,
      activeVersionId: workspace.activeVersionId,
    };
  }

  async updateVolumes(novelId: string, input: { volumes: unknown }): Promise<VolumePlanDocument> {
    await this.ensureVolumeWorkspace(novelId);
    const activeVersion = await this.getActiveVersionRow(novelId);
    const volumes = normalizeVolumeDraftInput(novelId, input.volumes);
    await prisma.$transaction(async (tx) => {
      await this.persistActiveVolumes(tx, novelId, volumes, activeVersion?.id ?? null);
    });
    this.emitVolumeUpdated(novelId);
    return {
      novelId,
      volumes,
      derivedOutline: buildDerivedOutlineFromVolumes(volumes),
      derivedStructuredOutline: buildDerivedStructuredOutlineFromVolumes(volumes),
      source: "volume",
      activeVersionId: activeVersion?.id ?? null,
    };
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
    const latestVersion = await this.getLatestVersionRow(novelId);
    const baseVersion = typeof input.baseVersion === "number"
      ? await prisma.volumePlanVersion.findFirst({
        where: { novelId, version: input.baseVersion },
      })
      : null;
    const nextVolumes = input.volumes
      ? normalizeVolumeDraftInput(novelId, input.volumes)
      : workspace.volumes;
    const previousVolumes = baseVersion
      ? this.parseVersionContent(novelId, baseVersion.contentJson)
      : workspace.volumes;
    const diffSummary = input.diffSummary?.trim() || buildVolumeDiffSummary(
      buildVolumeDiff(previousVolumes, nextVolumes, {
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
        contentJson: this.serializeVersionContent(novelId, nextVolumes),
        diffSummary,
      },
    });
    return mapVersionRow(created);
  }

  async activateVolumeVersion(novelId: string, versionId: string): Promise<VolumePlanVersion> {
    const target = await prisma.volumePlanVersion.findFirst({
      where: { id: versionId, novelId },
    });
    if (!target) {
      throw new Error("卷级版本不存在。");
    }
    const volumes = this.parseVersionContent(novelId, target.contentJson);
    if (volumes.length === 0) {
      throw new Error("卷级版本内容为空。");
    }
    await prisma.$transaction(async (tx) => {
      await tx.volumePlanVersion.updateMany({
        where: { novelId, status: "active" },
        data: { status: "frozen" },
      });
      await tx.volumePlanVersion.update({
        where: { id: target.id },
        data: { status: "active" },
      });
      await this.persistActiveVolumes(tx, novelId, volumes, target.id);
    });
    const refreshed = await prisma.volumePlanVersion.findUnique({ where: { id: target.id } });
    if (!refreshed) {
      throw new Error("卷级版本激活失败。");
    }
    this.emitVolumeUpdated(novelId);
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
      ? normalizeVolumeDraftInput(novelId, input.volumes)
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
    const volumes = normalizeVolumeDraftInput(novelId, input.volumes);
    const existingChapters = await prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        title: true,
        content: true,
        expectation: true,
        targetWordCount: true,
        conflictLevel: true,
        revealLevel: true,
        mustAvoid: true,
        taskSheet: true,
      },
    });
    const plan = buildVolumeSyncPlan(
      volumes,
      existingChapters as ExistingChapterRecord[],
      {
        preserveContent: input.preserveContent !== false,
        applyDeletes: input.applyDeletes === true,
      },
    );

    await prisma.$transaction(async (tx) => {
      await this.persistActiveVolumes(tx, novelId, volumes, workspace.activeVersionId);
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
            generationState: "planned",
            chapterStatus: "unplanned",
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
    return plan.preview;
  }

  async migrateLegacyVolumes(novelId: string): Promise<VolumePlanDocument> {
    const workspace = await this.ensureVolumeWorkspace(novelId);
    this.emitVolumeUpdated(novelId);
    return {
      novelId,
      volumes: workspace.volumes,
      derivedOutline: buildDerivedOutlineFromVolumes(workspace.volumes),
      derivedStructuredOutline: buildDerivedStructuredOutlineFromVolumes(workspace.volumes),
      source: workspace.source,
      activeVersionId: workspace.activeVersionId,
    };
  }

  async generateVolumes(novelId: string, options: VolumeGenerateOptions = {}): Promise<VolumePlanDocument> {
    const persistedWorkspace = await this.ensureVolumeWorkspace(novelId);
    const workspace = {
      ...persistedWorkspace,
      volumes: options.draftVolumes
        ? normalizeVolumeDraftContextInput(novelId, options.draftVolumes)
        : persistedWorkspace.volumes,
    };
    return generateVolumePlanDocument({
      novelId,
      workspace,
      options,
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
