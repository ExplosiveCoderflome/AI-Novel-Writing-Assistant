import { prisma } from "../../../db/prisma";
import { NovelCoreService } from "../NovelCoreService";
import { NovelWorldSliceService } from "../storyWorldSlice/NovelWorldSliceService";
import { CharacterPreparationService } from "../characterPrep/CharacterPreparationService";
import { CharacterDynamicsService } from "../dynamics/CharacterDynamicsService";
import { CharacterVisibleProfileService } from "../characterProfile/CharacterVisibleProfileService";
import {
  buildManualChapterControlPolicy,
  registerChapterExecutionStageRunner,
} from "../production/ChapterExecutionStageRunner";
import { buildManualProductionControlPolicy } from "../production/ChapterExecutionStageRunner";
import { registerChapterPreparationStageRunner } from "../production/ChapterPreparationStageRunner";
import { novelProductionOrchestrator } from "../production/NovelProductionOrchestrator";
import { registerQualityRepairStageRunner } from "../production/QualityRepairStageRunner";
import { ChapterRuntimeCoordinator } from "../runtime/ChapterRuntimeCoordinator";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { NovelChapterEditorService } from "../chapterEditor/NovelChapterEditorService";
import { ChapterEditorWorkspaceService } from "../chapterEditor/ChapterEditorWorkspaceService";
import type { NovelApplicationServices } from "./NovelApplicationContracts";

export class DefaultNovelApplicationServices {
  private readonly core = new NovelCoreService();
  private readonly worldSliceService = new NovelWorldSliceService();
  private readonly characterPreparationService = new CharacterPreparationService();
  private readonly characterDynamicsService = new CharacterDynamicsService();
  private readonly characterVisibleProfileService = new CharacterVisibleProfileService();
  private readonly volumeService = new NovelVolumeService();
  private readonly chapterEditorWorkspaceService = new ChapterEditorWorkspaceService();
  private readonly chapterEditorService = new NovelChapterEditorService();
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();
  private readonly qualityRepairCoordinator = new ChapterRuntimeCoordinator({
    reviewChapterAfterRepair: (novelId, chapterId, options) => this.core.reviewChapter(novelId, chapterId, options),
    resolveAuditIssues: (novelId, issueIds) => this.core.resolveAuditIssues(novelId, issueIds),
  });

  constructor() {
    registerChapterExecutionStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.chapterRuntimeCoordinator,
    });
    registerChapterPreparationStageRunner({
      getCore: () => this.core,
    });
    registerQualityRepairStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.qualityRepairCoordinator,
    });
  }

  listNovels(...args: Parameters<NovelCoreService["listNovels"]>) {
    return this.core.listNovels(...args);
  }

  createNovel(...args: Parameters<NovelCoreService["createNovel"]>) {
    return this.core.createNovel(...args);
  }

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

  updateNovel(...args: Parameters<NovelCoreService["updateNovel"]>) {
    return this.core.updateNovel(...args);
  }

  deleteNovel(...args: Parameters<NovelCoreService["deleteNovel"]>) {
    return this.core.deleteNovel(...args);
  }

  listChapters(...args: Parameters<NovelCoreService["listChapters"]>) {
    return this.core.listChapters(...args);
  }

  createChapter(...args: Parameters<NovelCoreService["createChapter"]>) {
    return this.core.createChapter(...args);
  }

  updateChapter(...args: Parameters<NovelCoreService["updateChapter"]>) {
    return this.core.updateChapter(...args);
  }

  deleteChapter(...args: Parameters<NovelCoreService["deleteChapter"]>) {
    return this.core.deleteChapter(...args);
  }

  listCharacters(...args: Parameters<NovelCoreService["listCharacters"]>) {
    return this.core.listCharacters(...args);
  }

  async createCharacter(...args: Parameters<NovelCoreService["createCharacter"]>) {
    const [novelId] = args;
    const created = await this.core.createCharacter(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
    return created;
  }

  async updateCharacter(...args: Parameters<NovelCoreService["updateCharacter"]>) {
    const [novelId] = args;
    const updated = await this.core.updateCharacter(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
    return updated;
  }

  async deleteCharacter(...args: Parameters<NovelCoreService["deleteCharacter"]>) {
    const [novelId] = args;
    await this.core.deleteCharacter(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
  }

  listCharacterTimeline(...args: Parameters<NovelCoreService["listCharacterTimeline"]>) {
    return this.core.listCharacterTimeline(...args);
  }

  syncCharacterTimeline(...args: Parameters<NovelCoreService["syncCharacterTimeline"]>) {
    return this.core.syncCharacterTimeline(...args);
  }

  syncAllCharacterTimeline(...args: Parameters<NovelCoreService["syncAllCharacterTimeline"]>) {
    return this.core.syncAllCharacterTimeline(...args);
  }

  evolveCharacter(...args: Parameters<NovelCoreService["evolveCharacter"]>) {
    return this.core.evolveCharacter(...args);
  }

  checkCharacterAgainstWorld(...args: Parameters<NovelCoreService["checkCharacterAgainstWorld"]>) {
    return this.core.checkCharacterAgainstWorld(...args);
  }

  async createNovelSnapshot(novelId: string, triggerType: "manual" | "auto_milestone" | "before_pipeline", label?: string) {
    const snapshot = await this.core.createNovelSnapshot(novelId, triggerType, label);
    const volumeWorkspace = await this.volumeService.getVolumes(novelId).catch(() => null);
    if (!volumeWorkspace) {
      return snapshot;
    }
    const payload = JSON.parse(snapshot.snapshotData) as Record<string, unknown>;
    return prisma.novelSnapshot.update({
      where: { id: snapshot.id },
      data: {
        snapshotData: JSON.stringify({
          ...payload,
          volumes: volumeWorkspace.volumes,
          activeVolumeVersionId: volumeWorkspace.activeVersionId,
        }),
      },
    });
  }

  listNovelSnapshots(...args: Parameters<NovelCoreService["listNovelSnapshots"]>) {
    return this.core.listNovelSnapshots(...args);
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

  createOutlineStream(...args: Parameters<NovelCoreService["createOutlineStream"]>) {
    return this.core.createOutlineStream(...args);
  }

  async createStructuredOutlineStream(...args: Parameters<NovelCoreService["createStructuredOutlineStream"]>) {
    const [novelId] = args;
    await this.core.createNovelSnapshot(novelId, "manual", `before-structured-outline-${Date.now()}`);
    return this.core.createStructuredOutlineStream(...args);
  }

  async createChapterStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    const [novelId, chapterId, options] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "chapter_execution",
      policy: buildManualChapterControlPolicy(),
      trigger: "manual_generate_chapter",
      payload: {
        mode: "single_chapter_stream",
        chapterId,
        options,
        includeRuntimePackage: true,
      },
    });
    if (!result.payload) {
      throw new Error("Unified chapter execution did not return a stream payload.");
    }
    return result.payload as Awaited<ReturnType<ChapterRuntimeCoordinator["createChapterStream"]>>;
  }

  createChapterRuntimeStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    return this.createChapterStream(...args);
  }

  generateTitles(...args: Parameters<NovelCoreService["generateTitles"]>) {
    return this.core.generateTitles(...args);
  }

  createBibleStream(...args: Parameters<NovelCoreService["createBibleStream"]>) {
    return this.core.createBibleStream(...args);
  }

  createBeatStream(...args: Parameters<NovelCoreService["createBeatStream"]>) {
    return this.core.createBeatStream(...args);
  }

  generateChapterHook(...args: Parameters<NovelCoreService["generateChapterHook"]>) {
    return this.core.generateChapterHook(...args);
  }

  reviewChapter(...args: Parameters<NovelCoreService["reviewChapter"]>) {
    return this.core.reviewChapter(...args);
  }

  async createRepairStream(...args: Parameters<NovelCoreService["createRepairStream"]>) {
    const [novelId, chapterId, options] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "quality_repair",
      policy: buildManualProductionControlPolicy(),
      trigger: "manual_repair_chapter",
      payload: {
        mode: "repair_chapter_stream",
        chapterId,
        options,
      },
    });
    if (!result.payload) {
      throw new Error("Unified quality repair stage did not return a repair stream payload.");
    }
    return result.payload as Awaited<ReturnType<ChapterRuntimeCoordinator["createRepairStream"]>>;
  }

  getQualityReport(...args: Parameters<NovelCoreService["getQualityReport"]>) {
    return this.core.getQualityReport(...args);
  }

  async startPipelineJob(...args: Parameters<NovelCoreService["startPipelineJob"]>) {
    const [novelId] = args;
    await this.createNovelSnapshot(novelId, "before_pipeline", `before-pipeline-${Date.now()}`);
    return this.core.startPipelineJob(...args);
  }

  getPipelineJob(...args: Parameters<NovelCoreService["getPipelineJob"]>) {
    return this.core.getPipelineJob(...args);
  }

  getPipelineJobById(...args: Parameters<NovelCoreService["getPipelineJobById"]>) {
    return this.core.getPipelineJobById(...args);
  }

  findActivePipelineJobForRange(...args: Parameters<NovelCoreService["findActivePipelineJobForRange"]>) {
    return this.core.findActivePipelineJobForRange(...args);
  }

  resumePipelineJob(...args: Parameters<NovelCoreService["resumePipelineJob"]>) {
    return this.core.resumePipelineJob(...args);
  }

  retryPipelineJob(...args: Parameters<NovelCoreService["retryPipelineJob"]>) {
    return this.core.retryPipelineJob(...args);
  }

  cancelPipelineJob(...args: Parameters<NovelCoreService["cancelPipelineJob"]>) {
    return this.core.cancelPipelineJob(...args);
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

  getVolumeVersion(...args: Parameters<NovelVolumeService["getVolumeVersion"]>) {
    return this.volumeService.getVolumeVersion(...args);
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

  ensureChapterExecutionContract(...args: Parameters<NovelVolumeService["ensureChapterExecutionContract"]>) {
    return this.volumeService.ensureChapterExecutionContract(...args);
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

  previewChapterRewrite(...args: Parameters<NovelChapterEditorService["previewRewrite"]>) {
    return this.chapterEditorService.previewRewrite(...args);
  }

  previewChapterAiRevision(...args: Parameters<NovelChapterEditorService["previewAiRevision"]>) {
    return this.chapterEditorService.previewAiRevision(...args);
  }

  getChapterEditorWorkspace(...args: Parameters<ChapterEditorWorkspaceService["getWorkspace"]>) {
    return this.chapterEditorWorkspaceService.getWorkspace(...args);
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

  async generateChapterPlan(...args: Parameters<NovelCoreService["generateChapterPlan"]>) {
    const [novelId, chapterId, options] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "chapter_preparation",
      policy: buildManualProductionControlPolicy(),
      trigger: "manual_generate_chapter_plan",
      payload: {
        mode: "generate_chapter_plan",
        chapterId,
        options,
      },
    });
    if (!result.payload) {
      throw new Error("Unified chapter preparation did not return a chapter plan payload.");
    }
    return result.payload as Awaited<ReturnType<NovelCoreService["generateChapterPlan"]>>;
  }

  getChapterPlan(...args: Parameters<NovelCoreService["getChapterPlan"]>) {
    return this.core.getChapterPlan(...args);
  }

  async replanNovel(...args: Parameters<NovelCoreService["replanNovel"]>) {
    const [novelId, input] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "quality_repair",
      policy: buildManualProductionControlPolicy(),
      trigger: "manual_replan_novel",
      payload: {
        mode: "replan_novel",
        input,
      },
    });
    if (!result.payload) {
      throw new Error("Unified quality repair stage did not return a replan payload.");
    }
    return result.payload as Awaited<ReturnType<NovelCoreService["replanNovel"]>>;
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

  getPayoffLedger(...args: Parameters<NovelCoreService["getPayoffLedger"]>) {
    return this.core.getPayoffLedger(...args);
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

  generateSupplementalCharacters(...args: Parameters<CharacterPreparationService["generateSupplementalCharacters"]>) {
    return this.characterPreparationService.generateSupplementalCharacters(...args);
  }

  applySupplementalCharacter(...args: Parameters<CharacterPreparationService["applySupplementalCharacter"]>) {
    return this.characterPreparationService.applySupplementalCharacter(...args);
  }

  deleteCharacterCastOption(...args: Parameters<CharacterPreparationService["deleteCharacterCastOption"]>) {
    return this.characterPreparationService.deleteCharacterCastOption(...args);
  }

  clearCharacterCastOptions(...args: Parameters<CharacterPreparationService["clearCharacterCastOptions"]>) {
    return this.characterPreparationService.clearCharacterCastOptions(...args);
  }

  generateCharacterVisibleProfile(...args: Parameters<CharacterVisibleProfileService["generateCharacterVisibleProfile"]>) {
    return this.characterVisibleProfileService.generateCharacterVisibleProfile(...args);
  }

  generateBatchCharacterVisibleProfiles(...args: Parameters<CharacterVisibleProfileService["generateBatchVisibleProfiles"]>) {
    return this.characterVisibleProfileService.generateBatchVisibleProfiles(...args);
  }

  async applyCharacterVisibleProfile(...args: Parameters<CharacterVisibleProfileService["applyCharacterVisibleProfile"]>) {
    const [novelId] = args;
    const result = await this.characterVisibleProfileService.applyCharacterVisibleProfile(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
    return result;
  }

  async applyBatchCharacterVisibleProfiles(...args: Parameters<CharacterVisibleProfileService["applyBatchVisibleProfiles"]>) {
    const [novelId] = args;
    const result = await this.characterVisibleProfileService.applyBatchVisibleProfiles(...args);
    await this.characterDynamicsService.rebuildDynamics(novelId, { sourceType: "rebuild_projection" }).catch(() => null);
    return result;
  }

  getCharacterDynamicsOverview(...args: Parameters<CharacterDynamicsService["getOverview"]>) {
    return this.characterDynamicsService.getOverview(...args);
  }

  listCharacterCandidates(...args: Parameters<CharacterDynamicsService["listCandidates"]>) {
    return this.characterDynamicsService.listCandidates(...args);
  }

  confirmCharacterCandidate(...args: Parameters<CharacterDynamicsService["confirmCandidate"]>) {
    return this.characterDynamicsService.confirmCandidate(...args);
  }

  mergeCharacterCandidate(...args: Parameters<CharacterDynamicsService["mergeCandidate"]>) {
    return this.characterDynamicsService.mergeCandidate(...args);
  }

  updateCharacterDynamicState(...args: Parameters<CharacterDynamicsService["updateCharacterDynamicState"]>) {
    return this.characterDynamicsService.updateCharacterDynamicState(...args);
  }

  updateCharacterRelationStage(...args: Parameters<CharacterDynamicsService["updateRelationStage"]>) {
    return this.characterDynamicsService.updateRelationStage(...args);
  }

  rebuildCharacterDynamics(...args: Parameters<CharacterDynamicsService["rebuildDynamics"]>) {
    return this.characterDynamicsService.rebuildDynamics(...args);
  }
}

export function createNovelApplicationServices(): NovelApplicationServices {
  return new DefaultNovelApplicationServices();
}
