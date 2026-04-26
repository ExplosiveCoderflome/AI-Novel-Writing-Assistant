import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type {
  DirectorConfirmRequest,
  DirectorTaskNotice,
} from "@ai-novel/shared/types/novelDirector";
import type { VolumeGenerationPhaseEvent } from "../volume/volumeModels";
import { getChapterTitleDiversityIssue } from "../volume/chapterTitleDiversity";
import { buildNovelEditResumeTarget } from "../workflow/novelWorkflow.shared";
import { logMemoryUsage } from "../../../runtime/memoryTelemetry";
import {
  buildDirectorSessionState,
  normalizeDirectorRunMode,
} from "./novelDirectorHelpers";
import {
  buildChapterDetailBundleLabel,
  buildChapterDetailBundleProgress,
  DIRECTOR_PROGRESS,
  type DirectorProgressItemKey,
} from "./novelDirectorProgress";
import {
  buildDirectorAutoExecutionState,
  countDirectorAutoExecutionChapterRange,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionPlanChapterRange,
} from "./novelDirectorAutoExecution";
import {
  flattenPreparedOutlineChapters,
  resolveStructuredOutlineRecoveryCursor,
  type StructuredOutlineDetailMode,
  type StructuredOutlineRecoveryCursor,
} from "./novelDirectorStructuredOutlineRecovery";
import { runDirectorTrackedStep } from "./directorProgressTracker";
import type { DirectorPhaseCallbacks, DirectorPhaseDependencies } from "./novelDirectorPhaseTypes";

function buildChapterOrderRangeLabel(startOrder: number, endOrder: number): string {
  return startOrder === endOrder ? `第 ${startOrder} 章` : `第 ${startOrder}-${endOrder} 章`;
}

function findMissingSelectedChapterOrders(
  selectedOrders: number[],
  range: { startOrder: number; endOrder: number },
): number[] {
  const selected = new Set(selectedOrders);
  const missing: number[] = [];
  for (let order = range.startOrder; order <= range.endOrder; order += 1) {
    if (!selected.has(order)) {
      missing.push(order);
    }
  }
  return missing;
}

function buildStructuredOutlinePhaseUpdate(event: VolumeGenerationPhaseEvent): {
  itemKey: DirectorProgressItemKey;
  itemLabel: string;
  progress: number;
} | null {
  if (event.scope === "beat_sheet") {
    return {
      itemKey: "beat_sheet",
      itemLabel: event.label.trim() || (event.phase === "load_context" ? "正在整理节奏板上下文" : "正在生成节奏板"),
      progress: DIRECTOR_PROGRESS.beatSheet,
    };
  }
  if (event.scope === "chapter_list") {
    return {
      itemKey: "chapter_list",
      itemLabel: event.label.trim() || (event.phase === "load_context" ? "正在整理拆章上下文" : "正在生成章节列表"),
      progress: DIRECTOR_PROGRESS.chapterList,
    };
  }
  if (event.scope === "rebalance") {
    return {
      itemKey: "chapter_list",
      itemLabel: event.label.trim() || "正在校准相邻卷衔接",
      progress: 0.8,
    };
  }
  return null;
}

function buildStructuredOutlineCursorKey(cursor: StructuredOutlineRecoveryCursor): string {
  return [
    cursor.step,
    cursor.volumeId ?? "",
    cursor.chapterId ?? "",
    cursor.detailMode ?? "",
    cursor.beatKey ?? "",
    cursor.preparedVolumeIds.length,
    cursor.selectedChapters.length,
    cursor.completedChapterCount,
    cursor.totalChapterCount,
    cursor.completedDetailSteps,
    cursor.totalDetailSteps,
  ].join("|");
}

async function persistStructuredOutlineVolumeSnapshot(input: {
  taskId: string;
  novelId: string;
  workspace: VolumePlanDocument;
  itemKey: "beat_sheet" | "chapter_list";
  scope: "beat_sheet" | "chapter_list";
  volumeId?: string | null;
  dependencies: Pick<DirectorPhaseDependencies, "volumeService">;
}): Promise<VolumePlanDocument> {
  return input.dependencies.volumeService.updateVolumesWithOptions(input.novelId, input.workspace, {
    emitEvent: false,
    syncPayoffLedger: false,
    memoryTelemetry: {
      taskId: input.taskId,
      stage: "structured_outline",
      itemKey: input.itemKey,
      scope: input.scope,
      entrypoint: "auto_director",
      volumeId: input.volumeId,
    },
  });
}

function buildChapterTitleNotice(input: {
  volume: VolumePlanDocument["volumes"][number];
  issue: string;
}): DirectorTaskNotice {
  return {
    code: "CHAPTER_TITLE_DIVERSITY",
    summary: input.issue,
    action: {
      type: "open_structured_outline",
      label: "快速修复章节标题",
      volumeId: input.volume.id,
    },
  };
}

export async function runDirectorStructuredOutlinePhase(input: {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  baseWorkspace: VolumePlanDocument;
  dependencies: DirectorPhaseDependencies;
  callbacks: DirectorPhaseCallbacks;
}): Promise<void> {
  const { taskId, novelId, request, baseWorkspace, dependencies, callbacks } = input;
  logMemoryUsage({
    event: "start",
    component: "runDirectorStructuredOutlinePhase",
    taskId,
    novelId,
    stage: "structured_outline",
    scope: "structured_outline",
    entrypoint: "auto_director",
    volumeCount: baseWorkspace.volumes.length,
    chapterCount: baseWorkspace.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
    beatSheetCount: baseWorkspace.beatSheets.length,
  });
  const firstVolume = baseWorkspace.volumes[0];
  if (!firstVolume) {
    throw new Error("自动导演未能生成可用卷骨架。");
  }
  const detailPlan = normalizeDirectorAutoExecutionPlan(
    normalizeDirectorRunMode(request.runMode) === "auto_to_execution"
      ? request.autoExecutionPlan
      : undefined,
  );
  const sortedVolumes = baseWorkspace.volumes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (detailPlan.mode === "volume" && (detailPlan.volumeOrder ?? 1) > sortedVolumes.length) {
    throw new Error(`当前卷规划只有 ${sortedVolumes.length} 卷，不能直接自动执行第 ${detailPlan.volumeOrder} 卷。`);
  }

  const directorSession = buildDirectorSessionState({
    runMode: request.runMode,
    phase: "structured_outline",
    isBackgroundRunning: true,
  });
  const runningResumeTarget = buildNovelEditResumeTarget({
    novelId,
    taskId,
    stage: "structured",
    volumeId: firstVolume.id,
  });
  await dependencies.workflowService.bootstrapTask({
    workflowTaskId: taskId,
    novelId,
    lane: "auto_director",
    title: request.candidate.workingTitle,
    seedPayload: callbacks.buildDirectorSeedPayload(request, novelId, {
      directorSession,
      resumeTarget: runningResumeTarget,
    }),
  });

  let workspace = baseWorkspace;
  let previousCursorKey: string | null = null;
  while (true) {
    const recoveryCursor = resolveStructuredOutlineRecoveryCursor({
      workspace,
      plan: detailPlan,
    });
    const cursorKey = buildStructuredOutlineCursorKey(recoveryCursor);
    if (cursorKey === previousCursorKey) {
      throw new Error("自动导演结构化大纲恢复没有推进，请检查章节规划生成结果后重试。");
    }
    previousCursorKey = cursorKey;

    if (recoveryCursor.step === "beat_sheet") {
      const targetVolume = workspace.volumes.find((volume) => volume.id === recoveryCursor.volumeId);
      if (!targetVolume) {
        throw new Error("自动导演恢复时缺少待生成节奏板的目标卷。");
      }
      workspace = await runDirectorTrackedStep({
        taskId,
        stage: "structured_outline",
        itemKey: "beat_sheet",
        itemLabel: `正在生成第 ${targetVolume.sortOrder} 卷节奏板`,
        progress: DIRECTOR_PROGRESS.beatSheet,
        volumeId: targetVolume.id,
        callbacks,
        run: async ({ updateStatus, signal }) => dependencies.volumeService.generateVolumes(novelId, {
          provider: request.provider,
          model: request.model,
          temperature: request.temperature,
          scope: "beat_sheet",
          targetVolumeId: targetVolume.id,
          draftWorkspace: workspace,
          taskId,
          entrypoint: "auto_director",
          signal,
          onPhaseStart: async (event) => {
            const update = buildStructuredOutlinePhaseUpdate(event);
            if (!update) {
              return;
            }
            await updateStatus(update);
          },
        }),
      });
      workspace = await persistStructuredOutlineVolumeSnapshot({
        taskId,
        novelId,
        workspace,
        itemKey: "beat_sheet",
        scope: "beat_sheet",
        volumeId: targetVolume.id,
        dependencies,
      });
      continue;
    }

    if (recoveryCursor.step === "chapter_list") {
      const targetVolume = workspace.volumes.find((volume) => volume.id === recoveryCursor.volumeId);
      if (!targetVolume) {
        throw new Error("自动导演恢复时缺少待拆章的目标卷。");
      }
      workspace = await runDirectorTrackedStep({
        taskId,
        stage: "structured_outline",
        itemKey: "chapter_list",
        itemLabel: `正在生成第 ${targetVolume.sortOrder} 卷章节列表`,
        progress: DIRECTOR_PROGRESS.chapterList,
        volumeId: targetVolume.id,
        callbacks,
        run: async ({ updateStatus, signal }) => dependencies.volumeService.generateVolumes(novelId, {
          provider: request.provider,
          model: request.model,
          temperature: request.temperature,
          scope: "chapter_list",
          targetVolumeId: targetVolume.id,
          draftWorkspace: workspace,
          taskId,
          entrypoint: "auto_director",
          signal,
          persistIntermediateDocuments: true,
          onPhaseStart: async (event) => {
            const update = buildStructuredOutlinePhaseUpdate(event);
            if (!update) {
              return;
            }
            await updateStatus(update);
          },
          onIntermediateDocument: async (event) => {
            workspace = event.document;
          },
        }),
      });
      workspace = await persistStructuredOutlineVolumeSnapshot({
        taskId,
        novelId,
        workspace,
        itemKey: "chapter_list",
        scope: "chapter_list",
        volumeId: targetVolume.id,
        dependencies,
      });
      const preparedVolume = workspace.volumes.find((item) => item.id === targetVolume.id);
      const titleDiversityIssue = preparedVolume
        ? getChapterTitleDiversityIssue(preparedVolume.chapters.map((chapter) => chapter.title))
        : null;
      await dependencies.workflowService.markTaskRunning(taskId, {
        stage: "structured_outline",
        itemKey: "chapter_list",
        itemLabel: titleDiversityIssue
          ? `第 ${targetVolume.sortOrder} 卷章节列表已生成，但标题结构仍需分散`
          : `第 ${targetVolume.sortOrder} 卷章节列表已生成`,
        progress: DIRECTOR_PROGRESS.chapterList,
        volumeId: targetVolume.id,
        seedPayload: {
          taskNotice: titleDiversityIssue
            ? buildChapterTitleNotice({
              volume: preparedVolume ?? targetVolume,
              issue: titleDiversityIssue,
            })
            : null,
        },
      });
      continue;
    }

    if (recoveryCursor.step === "chapter_detail_bundle") {
      const targetDetailMode = recoveryCursor.detailMode as StructuredOutlineDetailMode | null;
      if (
        !recoveryCursor.chapterId
        || !recoveryCursor.volumeId
        || !targetDetailMode
        || recoveryCursor.nextChapterIndex == null
      ) {
        throw new Error("自动导演恢复时缺少章节细化所需游标。");
      }
      const targetVolumeId = recoveryCursor.volumeId;
      const targetChapterId = recoveryCursor.chapterId;
      const targetChapterIndex = recoveryCursor.nextChapterIndex;
      workspace = await runDirectorTrackedStep({
        taskId,
        stage: "structured_outline",
        itemKey: "chapter_detail_bundle",
        itemLabel: buildChapterDetailBundleLabel(
          targetChapterIndex + 1,
          recoveryCursor.totalChapterCount,
          targetDetailMode,
        ),
        progress: buildChapterDetailBundleProgress(
          recoveryCursor.completedDetailSteps,
          recoveryCursor.totalDetailSteps,
        ),
        chapterId: targetChapterId,
        volumeId: targetVolumeId,
        callbacks,
        run: async ({ signal }) => dependencies.volumeService.generateVolumes(novelId, {
          provider: request.provider,
          model: request.model,
          temperature: request.temperature,
          scope: "chapter_detail",
          targetVolumeId,
          targetChapterId,
          detailMode: targetDetailMode,
          draftWorkspace: workspace,
          taskId,
          entrypoint: "auto_director",
          signal,
        }),
      });
      workspace = await dependencies.volumeService.updateVolumesWithOptions(novelId, workspace, {
        volumeUpdateReason: "chapter_execution_contract_refined",
        syncPayoffLedger: false,
        memoryTelemetry: {
          taskId,
          stage: "structured_outline",
          itemKey: "chapter_detail_bundle",
          scope: "chapter_detail",
          entrypoint: "auto_director",
          volumeId: recoveryCursor.volumeId,
          chapterId: recoveryCursor.chapterId,
        },
      });
      continue;
    }

    if (recoveryCursor.step === "chapter_sync" || recoveryCursor.step === "completed") {
      break;
    }
  }

  const preparedVolumeIds = resolveStructuredOutlineRecoveryCursor({
    workspace,
    plan: detailPlan,
  }).preparedVolumeIds;
  const maxPreparedChapterOrder = Math.max(
    0,
    ...flattenPreparedOutlineChapters(workspace).map((chapter) => chapter.chapterOrder),
  );
  const targetChapterRange = resolveDirectorAutoExecutionPlanChapterRange(detailPlan);
  if (targetChapterRange && maxPreparedChapterOrder < targetChapterRange.endOrder) {
    throw new Error(
      `当前已生成的章节规划最多只覆盖到第 ${maxPreparedChapterOrder} 章，不能直接自动执行${buildChapterOrderRangeLabel(targetChapterRange.startOrder, targetChapterRange.endOrder)}。`,
    );
  }

  await callbacks.markDirectorTaskRunning(
    taskId,
    "structured_outline",
    "chapter_sync",
    "正在同步已准备章节到执行区",
    DIRECTOR_PROGRESS.chapterSync,
  );
  logMemoryUsage({
    event: "before_sync_write",
    component: "runDirectorStructuredOutlinePhase",
    taskId,
    novelId,
    stage: "structured_outline",
    itemKey: "chapter_sync",
    scope: "structured_outline",
    entrypoint: "auto_director",
    volumeCount: workspace.volumes.length,
    chapterCount: workspace.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
    beatSheetCount: workspace.beatSheets.length,
  });
  const persistedOutlineWorkspace = await dependencies.volumeService.updateVolumesWithOptions(novelId, workspace, {
    volumeUpdateReason: "chapter_execution_contract_refined",
    syncPayoffLedger: false,
    memoryTelemetry: {
      taskId,
      stage: "structured_outline",
      itemKey: "chapter_sync",
      scope: "structured_outline",
      entrypoint: "auto_director",
    },
  });
  await dependencies.volumeService.syncVolumeChaptersWithOptions(novelId, {
    volumes: persistedOutlineWorkspace.volumes,
    preserveContent: true,
    applyDeletes: false,
  }, {
    emitEvent: false,
    syncPayoffLedger: false,
  });
  await dependencies.characterDynamicsService.rebuildDynamics(novelId, {
    sourceType: "rebuild_projection",
  }).catch((error) => {
    console.warn(
      `[director.structured_outline] event=character_dynamics_rebuild_failed taskId=${taskId} novelId=${novelId} error=${JSON.stringify(error instanceof Error ? error.message : String(error))}`,
    );
  });

  const syncCursor = resolveStructuredOutlineRecoveryCursor({
    workspace: persistedOutlineWorkspace,
    plan: detailPlan,
  });
  const selectedChapters = syncCursor.selectedChapters;
  if (selectedChapters.length === 0) {
    throw new Error("自动导演未能准备出可执行的章节范围。");
  }
  const selectedChapterOrders = selectedChapters.map((chapter) => chapter.chapterOrder).sort((left, right) => left - right);
  if (targetChapterRange) {
    const missingOrders = findMissingSelectedChapterOrders(selectedChapterOrders, targetChapterRange);
    if (missingOrders.length > 0) {
      throw new Error(
        `自动导演已准备的章节规划缺少第 ${missingOrders.slice(0, 5).join("、")} 章，不能直接自动执行${buildChapterOrderRangeLabel(targetChapterRange.startOrder, targetChapterRange.endOrder)}。`,
      );
    }
  }
  const autoExecutionScopeLabel = syncCursor.scopeLabel;

  await callbacks.markDirectorTaskRunning(
    taskId,
    "structured_outline",
    "chapter_detail_bundle",
    `${autoExecutionScopeLabel}细化已完成，正在同步章节执行资源`,
    DIRECTOR_PROGRESS.chapterDetailDone,
    {
      chapterId: selectedChapters[0]?.id ?? null,
      volumeId: selectedChapters[0]?.volumeId ?? null,
    },
  );
  const persistedChapters = await dependencies.novelContextService.listChapters(novelId);
  if (persistedChapters.length === 0) {
    throw new Error("自动导演已生成拆章结果，但章节资源没有成功同步到执行区。");
  }

  await dependencies.novelContextService.updateNovel(novelId, {
    projectStatus: "in_progress",
    storylineStatus: "in_progress",
    outlineStatus: "in_progress",
  });

  const autoExecutionState = buildDirectorAutoExecutionState({
    range: {
      startOrder: selectedChapterOrders[0] ?? 1,
      endOrder: selectedChapterOrders[selectedChapterOrders.length - 1] ?? selectedChapterOrders[0] ?? 1,
      totalChapterCount: targetChapterRange
        ? countDirectorAutoExecutionChapterRange(targetChapterRange)
        : selectedChapters.length,
      firstChapterId: selectedChapters[0]?.id ?? null,
    },
    chapters: persistedChapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      content: chapter.content ?? null,
      generationState: chapter.generationState ?? null,
    })),
    plan: detailPlan,
    scopeLabel: autoExecutionScopeLabel,
    volumeTitle: detailPlan.mode === "volume" ? selectedChapters[0]?.volumeTitle ?? null : null,
    preparedVolumeIds,
  });

  const pausedSession = buildDirectorSessionState({
    runMode: request.runMode,
    phase: "front10_ready",
    isBackgroundRunning: false,
  });
  const chapterResumeTarget = buildNovelEditResumeTarget({
    novelId,
    taskId,
    stage: "chapter",
    volumeId: selectedChapters[0]?.volumeId ?? firstVolume.id,
    chapterId: selectedChapters[0]?.id ?? null,
  });
  await dependencies.workflowService.recordCheckpoint(taskId, {
    stage: "chapter_execution",
    checkpointType: "front10_ready",
    checkpointSummary: `《${request.candidate.workingTitle.trim() || request.title?.trim() || "当前项目"}》已准备好${autoExecutionScopeLabel}的章节执行资源。`,
    itemLabel: `${autoExecutionScopeLabel}已可进入章节执行`,
    volumeId: selectedChapters[0]?.volumeId ?? firstVolume.id,
    chapterId: selectedChapters[0]?.id ?? null,
    progress: DIRECTOR_PROGRESS.front10Ready,
    seedPayload: callbacks.buildDirectorSeedPayload(request, novelId, {
      directorSession: pausedSession,
      resumeTarget: chapterResumeTarget,
      autoExecution: autoExecutionState,
    }),
  });
  logMemoryUsage({
    event: "done",
    component: "runDirectorStructuredOutlinePhase",
    taskId,
    novelId,
    stage: "structured_outline",
    itemKey: "front10_ready",
    scope: autoExecutionScopeLabel,
    entrypoint: "auto_director",
    volumeCount: persistedOutlineWorkspace.volumes.length,
    chapterCount: persistedOutlineWorkspace.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
    beatSheetCount: persistedOutlineWorkspace.beatSheets.length,
  });
}
