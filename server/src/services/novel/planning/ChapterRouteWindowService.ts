import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { DirectorCompletionProfile } from "@ai-novel/shared/types/directorCompletion";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import {
  getBeatExpectedChapterCount,
  resolveVolumeChapterBeatKey,
} from "../volume/volumeGenerationHelpers";

export interface ChapterRouteWindowOptions {
  min?: number;
  target?: number;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  completionProfile?: DirectorCompletionProfile;
  /** Keeps JIT planning owned by the same auto-director task as chapter execution. */
  taskId?: string;
}

export interface ChapterRouteWindowResult {
  availableRouteCount: number;
  extended: boolean;
}

const routeWindowLocks = new Map<string, Promise<ChapterRouteWindowResult>>();

export class ChapterRouteWindowService {
  constructor(private readonly volumeService = new NovelVolumeService()) {}

  async ensureRouteWindow(
    novelId: string,
    fromChapterOrder: number,
    options: ChapterRouteWindowOptions = {},
  ): Promise<ChapterRouteWindowResult> {
    const active = routeWindowLocks.get(novelId);
    if (active) {
      return active;
    }
    const task = this.ensureRouteWindowUnlocked(novelId, fromChapterOrder, options)
      .finally(() => routeWindowLocks.delete(novelId));
    routeWindowLocks.set(novelId, task);
    return task;
  }

  private async ensureRouteWindowUnlocked(
    novelId: string,
    fromChapterOrder: number,
    options: ChapterRouteWindowOptions,
  ): Promise<ChapterRouteWindowResult> {
    const minimum = Math.max(1, options.min ?? 3);
    const target = Math.max(minimum, options.target ?? 5);
    const compactTarget = options.completionProfile?.mode === "compact_book"
      ? options.completionProfile.targetChapterCount
      : null;
    const remaining = compactTarget == null ? null : Math.max(0, compactTarget - fromChapterOrder + 1);
    const closingGuidance = remaining != null && remaining <= 3
      ? `紧凑全书终章倒计时：剩余约 ${remaining} 章。只生成结局合同所需的收束路线，不要创建新的主线或下一阶段钩子。`
      : remaining != null && remaining <= 8
        ? `紧凑全书收束规划：剩余约 ${remaining} 章。优先完成主冲突、关系变化和未兑现回报，不扩展远期世界或新主线。`
        : undefined;
    let availableRouteCount = await this.countAvailableRoute(novelId, fromChapterOrder);
    if (availableRouteCount >= minimum) {
      return { availableRouteCount, extended: false };
    }

    let workspace = await this.volumeService.getVolumes(novelId);
    let extended = false;
    while (availableRouteCount < target) {
      const next = this.findNextRouteTarget(workspace);
      if (!next) {
        const expandedWorkspace = await this.extendFutureVolumeSkeleton(
          novelId,
          workspace,
          options,
        );
        if (!expandedWorkspace) {
          break;
        }
        workspace = expandedWorkspace;
        extended = true;
        continue;
      }
      if (!next.beatKey) {
        workspace = await this.volumeService.generateVolumes(novelId, {
          scope: "beat_sheet",
          targetVolumeId: next.volumeId,
          draftWorkspace: workspace,
          provider: options.provider,
          model: options.model,
          temperature: options.temperature,
          taskId: options.taskId,
          guidance: closingGuidance,
          entrypoint: "jit_route_window",
        });
        workspace = await this.volumeService.updateVolumesWithOptions(novelId, workspace, {
          emitEvent: false,
          syncPayoffLedger: false,
          volumeUpdateReason: "chapter_execution_contract_refined",
        });
        continue;
      }

      workspace = await this.volumeService.generateVolumes(novelId, {
        scope: "chapter_list",
        targetVolumeId: next.volumeId,
        generationMode: "single_beat",
        targetBeatKey: next.beatKey,
        draftWorkspace: workspace,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        taskId: options.taskId,
        guidance: closingGuidance,
        entrypoint: "jit_route_window",
      });
      await this.volumeService.syncVolumeChaptersWithOptions(novelId, {
        volumes: workspace.volumes,
        preserveContent: true,
        applyDeletes: false,
        allowIncompleteExecutionContracts: true,
      }, {
        emitEvent: false,
        syncPayoffLedger: false,
      });
      extended = true;
      availableRouteCount = await this.countAvailableRoute(novelId, fromChapterOrder);
    }
    return { availableRouteCount, extended };
  }

  private async extendFutureVolumeSkeleton(
    novelId: string,
    workspace: VolumePlanDocument,
    options: ChapterRouteWindowOptions,
  ): Promise<VolumePlanDocument | null> {
    const targetChapterCount = options.completionProfile?.targetChapterCount ?? 0;
    const plannedChapterEnd = Math.max(
      0,
      ...workspace.volumes.flatMap((volume) => volume.chapters.map((chapter) => chapter.chapterOrder)),
    );
    if (!workspace.strategyPlan || targetChapterCount <= plannedChapterEnd) {
      return null;
    }

    const skeletonVolumeCount = Math.max(
      workspace.volumes.length + 1,
      workspace.strategyPlan.recommendedVolumeCount,
    );
    const generatedSkeleton = await this.volumeService.generateVolumes(novelId, {
      scope: "skeleton",
      skeletonVolumeCount,
      draftWorkspace: workspace,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      taskId: options.taskId,
      entrypoint: "jit_route_window",
      guidance: [
        "滚动生产需要补齐后续卷骨架。",
        "已有卷及其章节已经进入生产，必须视为固定事实；只为尚未创建的后续卷安排承接、升级和兑现。",
        `全书目标约 ${targetChapterCount} 章；当前只补卷级骨架，不拆远期章节。`,
      ].join("\n"),
    });
    const futureVolumes = generatedSkeleton.volumes.slice(workspace.volumes.length);
    if (futureVolumes.length === 0) {
      return null;
    }
    return this.volumeService.updateVolumesWithOptions(novelId, {
      volumes: [...workspace.volumes, ...futureVolumes],
      beatSheets: workspace.beatSheets,
      rebalanceDecisions: workspace.rebalanceDecisions,
    }, {
      emitEvent: false,
      syncPayoffLedger: false,
      volumeUpdateReason: "chapter_execution_contract_refined",
    });
  }

  private async countAvailableRoute(novelId: string, fromChapterOrder: number): Promise<number> {
    return prisma.chapter.count({
      where: {
        novelId,
        order: { gte: fromChapterOrder },
      },
    });
  }

  private findNextRouteTarget(workspace: VolumePlanDocument): { volumeId: string; beatKey: string | null } | null {
    const volumes = workspace.volumes.slice().sort((left, right) => left.sortOrder - right.sortOrder);
    for (const volume of volumes) {
      const beatSheet = workspace.beatSheets.find((sheet) => sheet.volumeId === volume.id);
      if (!beatSheet || beatSheet.beats.length === 0) {
        return { volumeId: volume.id, beatKey: null };
      }
      for (const beat of beatSheet.beats) {
        const generatedCount = volume.chapters.filter((chapter) => (
          resolveVolumeChapterBeatKey({ chapter, volume, beatSheet }) === beat.key
        )).length;
        if (generatedCount < Math.max(1, getBeatExpectedChapterCount(beat))) {
          return { volumeId: volume.id, beatKey: beat.key };
        }
      }
    }
    return null;
  }
}
