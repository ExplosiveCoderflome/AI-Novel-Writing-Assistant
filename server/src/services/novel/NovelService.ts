import { prisma } from "../../db/prisma";
import { NovelPipelineService } from "./NovelPipelineService";
import { NovelCoreService } from "./NovelCoreService";
import { NovelWorldSliceService } from "./storyWorldSlice/NovelWorldSliceService";
import { CharacterPreparationService } from "./characterPrep/CharacterPreparationService";
import { NovelVolumeService } from "./volume/NovelVolumeService";

export class NovelService extends NovelPipelineService {
  private readonly worldSliceService = new NovelWorldSliceService();
  private readonly characterPreparationService = new CharacterPreparationService();
  private readonly volumeService = new NovelVolumeService();

  async getNovelById(id: string) {
    const novel = await this.core.getNovelById(id);
    if (!novel) {
      return null;
    }
    const volumeWorkspace = await this.volumeService.getVolumes(id).catch(() => null);
    if (!volumeWorkspace) {
      return novel;
    }
    return {
      ...novel,
      volumes: volumeWorkspace.volumes,
      volumeSource: volumeWorkspace.source,
      activeVolumeVersionId: volumeWorkspace.activeVersionId,
    };
  }

  getVolumes(...args: Parameters<NovelVolumeService["getVolumes"]>) {
    return this.volumeService.getVolumes(...args);
  }

  updateVolumes(...args: Parameters<NovelVolumeService["updateVolumes"]>) {
    return this.volumeService.updateVolumes(...args);
  }

  generateVolumes(...args: Parameters<NovelVolumeService["generateVolumes"]>) {
    return this.volumeService.generateVolumes(...args);
  }

  listVolumeVersions(...args: Parameters<NovelVolumeService["listVolumeVersions"]>) {
    return this.volumeService.listVolumeVersions(...args);
  }

  createVolumeDraft(...args: Parameters<NovelVolumeService["createVolumeDraft"]>) {
    return this.volumeService.createVolumeDraft(...args);
  }

  activateVolumeVersion(...args: Parameters<NovelVolumeService["activateVolumeVersion"]>) {
    return this.volumeService.activateVolumeVersion(...args);
  }

  freezeVolumeVersion(...args: Parameters<NovelVolumeService["freezeVolumeVersion"]>) {
    return this.volumeService.freezeVolumeVersion(...args);
  }

  getVolumeDiff(...args: Parameters<NovelVolumeService["getVolumeDiff"]>) {
    return this.volumeService.getVolumeDiff(...args);
  }

  analyzeVolumeImpact(...args: Parameters<NovelVolumeService["analyzeVolumeImpact"]>) {
    return this.volumeService.analyzeVolumeImpact(...args);
  }

  syncVolumeChapters(...args: Parameters<NovelVolumeService["syncVolumeChapters"]>) {
    return this.volumeService.syncVolumeChapters(...args);
  }

  migrateLegacyVolumes(...args: Parameters<NovelVolumeService["migrateLegacyVolumes"]>) {
    return this.volumeService.migrateLegacyVolumes(...args);
  }

  async listStorylineVersions(...args: Parameters<NovelCoreService["listStorylineVersions"]>) {
    const rows = await this.volumeService.listStorylineVersionsCompat(...args);
    return rows.map((row) => ({
      ...row,
      diffSummary: row.diffSummary ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  async createStorylineDraft(...args: Parameters<NovelCoreService["createStorylineDraft"]>) {
    const row = await this.volumeService.createStorylineDraftCompat(...args);
    return {
      ...row,
      diffSummary: row.diffSummary ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async activateStorylineVersion(...args: Parameters<NovelCoreService["activateStorylineVersion"]>) {
    const row = await this.volumeService.activateStorylineVersionCompat(...args);
    return {
      ...row,
      diffSummary: row.diffSummary ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async freezeStorylineVersion(...args: Parameters<NovelCoreService["freezeStorylineVersion"]>) {
    const row = await this.volumeService.freezeStorylineVersionCompat(...args);
    return {
      ...row,
      diffSummary: row.diffSummary ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async getStorylineDiff(...args: Parameters<NovelCoreService["getStorylineDiff"]>) {
    const diff = await this.volumeService.getStorylineDiffCompat(...args);
    return {
      ...diff,
      diffSummary: diff.diffSummary ?? "",
    };
  }

  analyzeStorylineImpact(...args: Parameters<NovelCoreService["analyzeStorylineImpact"]>) {
    return this.volumeService.analyzeStorylineImpactCompat(...args);
  }

  getNovelState(...args: Parameters<NovelCoreService["getNovelState"]>) {
    return this.core.getNovelState(...args);
  }

  getLatestStateSnapshot(...args: Parameters<NovelCoreService["getLatestStateSnapshot"]>) {
    return this.core.getLatestStateSnapshot(...args);
  }

  getChapterStateSnapshot(...args: Parameters<NovelCoreService["getChapterStateSnapshot"]>) {
    return this.core.getChapterStateSnapshot(...args);
  }

  rebuildNovelState(...args: Parameters<NovelCoreService["rebuildNovelState"]>) {
    return this.core.rebuildNovelState(...args);
  }

  generateBookPlan(...args: Parameters<NovelCoreService["generateBookPlan"]>) {
    return this.core.generateBookPlan(...args);
  }

  generateArcPlan(...args: Parameters<NovelCoreService["generateArcPlan"]>) {
    return this.core.generateArcPlan(...args);
  }

  generateChapterPlan(...args: Parameters<NovelCoreService["generateChapterPlan"]>) {
    return this.core.generateChapterPlan(...args);
  }

  getChapterPlan(...args: Parameters<NovelCoreService["getChapterPlan"]>) {
    return this.core.getChapterPlan(...args);
  }

  replanNovel(...args: Parameters<NovelCoreService["replanNovel"]>) {
    return this.core.replanNovel(...args);
  }

  auditChapter(...args: Parameters<NovelCoreService["auditChapter"]>) {
    return this.core.auditChapter(...args);
  }

  listChapterAuditReports(...args: Parameters<NovelCoreService["listChapterAuditReports"]>) {
    return this.core.listChapterAuditReports(...args);
  }

  resolveAuditIssues(...args: Parameters<NovelCoreService["resolveAuditIssues"]>) {
    return this.core.resolveAuditIssues(...args);
  }

  getWorldSlice(...args: Parameters<NovelWorldSliceService["getWorldSliceView"]>) {
    return this.worldSliceService.getWorldSliceView(...args);
  }

  refreshWorldSlice(...args: Parameters<NovelWorldSliceService["refreshWorldSlice"]>) {
    return this.worldSliceService.refreshWorldSlice(...args);
  }

  updateWorldSliceOverrides(...args: Parameters<NovelWorldSliceService["updateWorldSliceOverrides"]>) {
    return this.worldSliceService.updateWorldSliceOverrides(...args);
  }

  listCharacterRelations(...args: Parameters<CharacterPreparationService["listCharacterRelations"]>) {
    return this.characterPreparationService.listCharacterRelations(...args);
  }

  listCharacterCastOptions(...args: Parameters<CharacterPreparationService["listCharacterCastOptions"]>) {
    return this.characterPreparationService.listCharacterCastOptions(...args);
  }

  generateCharacterCastOptions(...args: Parameters<CharacterPreparationService["generateCharacterCastOptions"]>) {
    return this.characterPreparationService.generateCharacterCastOptions(...args);
  }

  applyCharacterCastOption(...args: Parameters<CharacterPreparationService["applyCharacterCastOption"]>) {
    return this.characterPreparationService.applyCharacterCastOption(...args);
  }

  async createNovelSnapshot(novelId: string, triggerType: "manual" | "auto_milestone" | "before_pipeline", label?: string) {
    const snapshot = await this.core.createNovelSnapshot(novelId, triggerType, label);
    const volumeWorkspace = await this.volumeService.getVolumes(novelId).catch(() => null);
    if (!volumeWorkspace) {
      return snapshot;
    }
    const payload = JSON.parse(snapshot.snapshotData) as Record<string, unknown>;
    const updated = await prisma.novelSnapshot.update({
      where: { id: snapshot.id },
      data: {
        snapshotData: JSON.stringify({
          ...payload,
          volumes: volumeWorkspace.volumes,
          activeVolumeVersionId: volumeWorkspace.activeVersionId,
        }),
      },
    });
    return updated;
  }

  async restoreFromSnapshot(novelId: string, snapshotId: string) {
    const snapshot = await prisma.novelSnapshot.findFirst({
      where: { id: snapshotId, novelId },
    });
    if (!snapshot) {
      throw new Error("Snapshot not found.");
    }
    const data = JSON.parse(snapshot.snapshotData) as {
      outline?: string | null;
      structuredOutline?: string | null;
      chapters?: Array<{ id: string; title?: string; order?: number; content?: string | null }>;
      volumes?: unknown;
    };
    await this.createNovelSnapshot(novelId, "manual", `before-restore-${snapshotId.slice(0, 8)}`);
    await prisma.novel.update({
      where: { id: novelId },
      data: {
        outline: data.outline ?? undefined,
        structuredOutline: data.structuredOutline ?? undefined,
      },
    });
    if (Array.isArray(data.chapters) && data.chapters.length > 0) {
      for (const chapter of data.chapters) {
        if (!chapter.id) {
          continue;
        }
        await prisma.chapter.updateMany({
          where: { id: chapter.id, novelId },
          data: {
            ...(chapter.title != null ? { title: chapter.title } : {}),
            ...(chapter.order != null ? { order: chapter.order } : {}),
            ...(chapter.content != null ? { content: chapter.content } : {}),
          },
        });
      }
    }
    if (Array.isArray(data.volumes) && data.volumes.length > 0) {
      await this.volumeService.updateVolumes(novelId, { volumes: data.volumes });
    } else {
      await this.volumeService.migrateLegacyVolumes(novelId);
    }
    return this.getNovelById(novelId);
  }

  async startPipelineJob(...args: Parameters<NovelCoreService["startPipelineJob"]>) {
    const [novelId] = args;
    await this.createNovelSnapshot(novelId, "before_pipeline", `before-pipeline-${Date.now()}`);
    return this.core.startPipelineJob(...args);
  }
}
