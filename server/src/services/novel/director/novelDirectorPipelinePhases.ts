import type { CharacterCastOption, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { CharacterPreparationService } from "../characterPrep/CharacterPreparationService";
import { buildCharacterCastBlockedMessage } from "../characterPrep/characterCastQuality";
import { NovelContextService } from "../NovelContextService";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import type { VolumeGenerationPhaseEvent } from "../volume/volumeModels";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import { buildNovelEditResumeTarget } from "../workflow/novelWorkflow.shared";
import {
  buildDirectorSessionState,
  buildStoryInput,
  normalizeDirectorRunMode,
  toBookSpec,
} from "./novelDirectorHelpers";
import {
  buildChapterDetailBundleLabel,
  buildChapterDetailBundleProgress,
  DIRECTOR_CHAPTER_DETAIL_MODES,
  DIRECTOR_PROGRESS,
  type DirectorProgressItemKey,
} from "./novelDirectorProgress";
import {
  buildDirectorAutoExecutionScopeLabel,
  buildDirectorAutoExecutionState,
  normalizeDirectorAutoExecutionPlan,
} from "./novelDirectorAutoExecution";
import { runDirectorTrackedStep } from "./directorProgressTracker";

type DirectorMutatingStage =
  | "auto_director"
  | "story_macro"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline";

interface DirectorPhaseDependencies {
  workflowService: NovelWorkflowService;
  novelContextService: NovelContextService;
  characterPreparationService: {
    generateAutoCharacterCastOption: (novelId: string, input: {
      provider?: DirectorConfirmRequest["provider"];
      model?: string;
      temperature?: number;
      storyInput?: string;
    }) => Promise<CharacterCastOption>;
    assessCharacterCastOptions: (
      castOptions: CharacterCastOption[],
      storyInput: string,
    ) => ReturnType<CharacterPreparationService["assessCharacterCastOptions"]>;
    applyCharacterCastOption: (
      novelId: string,
      optionId: string,
    ) => ReturnType<CharacterPreparationService["applyCharacterCastOption"]>;
  };
  volumeService: NovelVolumeService;
}

interface DirectorPhaseCallbacks {
  buildDirectorSeedPayload: (
    input: DirectorConfirmRequest,
    novelId: string | null,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
  markDirectorTaskRunning: (
    taskId: string,
    stage: DirectorMutatingStage,
    itemKey: DirectorProgressItemKey,
    itemLabel: string,
    progress: number,
  ) => Promise<void>;
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

function buildVolumeStrategyPhaseUpdate(event: VolumeGenerationPhaseEvent): {
  itemKey: DirectorProgressItemKey;
  itemLabel: string;
  progress: number;
} | null {
  if (event.scope === "strategy") {
    return {
      itemKey: "volume_strategy",
      itemLabel: event.phase === "load_context" ? "正在整理卷战略上下文" : "正在生成卷战略",
      progress: DIRECTOR_PROGRESS.volumeStrategy,
    };
  }
  if (event.scope === "skeleton") {
    return {
      itemKey: "volume_skeleton",
      itemLabel: event.phase === "load_context" ? "正在整理卷骨架上下文" : "正在生成卷骨架",
      progress: DIRECTOR_PROGRESS.volumeSkeleton,
    };
  }
  return null;
}

interface PreparedOutlineChapterRef {
  id: string;
  volumeId: string;
  volumeOrder: number;
  volumeTitle: string;
  chapterOrder: number;
  title: string;
}

function flattenPreparedOutlineChapters(workspace: VolumePlanDocument): PreparedOutlineChapterRef[] {
  return workspace.volumes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((volume) => volume.chapters
      .slice()
      .sort((left, right) => left.chapterOrder - right.chapterOrder)
      .map((chapter) => ({
        id: chapter.id,
        volumeId: volume.id,
        volumeOrder: volume.sortOrder,
        volumeTitle: volume.title,
        chapterOrder: chapter.chapterOrder,
        title: chapter.title,
      })));
}

function selectPreparedOutlineChapters(
  workspace: VolumePlanDocument,
  request: DirectorConfirmRequest,
): PreparedOutlineChapterRef[] {
  const plan = normalizeDirectorAutoExecutionPlan(
    normalizeDirectorRunMode(request.runMode) === "auto_to_execution"
      ? request.autoExecutionPlan
      : undefined,
  );
  const prepared = flattenPreparedOutlineChapters(workspace);
  if (plan.mode === "volume") {
    return prepared.filter((chapter) => chapter.volumeOrder === plan.volumeOrder);
  }
  if (plan.mode === "chapter_range") {
    return prepared.filter((chapter) => (
      chapter.chapterOrder >= (plan.startOrder ?? 1)
      && chapter.chapterOrder <= (plan.endOrder ?? plan.startOrder ?? 1)
    ));
  }
  return prepared.slice(0, 10);
}

export async function runDirectorCharacterSetupPhase(input: {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  dependencies: DirectorPhaseDependencies;
  callbacks: DirectorPhaseCallbacks;
}): Promise<boolean> {
  const { taskId, novelId, request, dependencies, callbacks } = input;
  const directorSession = buildDirectorSessionState({
    runMode: request.runMode,
    phase: "character_setup",
    isBackgroundRunning: true,
  });
  const resumeTarget = buildNovelEditResumeTarget({
    novelId,
    taskId,
    stage: "character",
  });
  await dependencies.workflowService.bootstrapTask({
    workflowTaskId: taskId,
    novelId,
    lane: "auto_director",
    title: request.candidate.workingTitle,
    seedPayload: callbacks.buildDirectorSeedPayload(request, novelId, {
      directorSession,
      resumeTarget,
    }),
  });
  const storyInput = buildStoryInput(request, toBookSpec(request.candidate, request.idea, request.estimatedChapterCount));
  const targetOption = await runDirectorTrackedStep({
    taskId,
    stage: "character_setup",
    itemKey: "character_setup",
    itemLabel: "正在生成角色阵容",
    progress: DIRECTOR_PROGRESS.characterSetup,
    callbacks,
    run: async () => dependencies.characterPreparationService.generateAutoCharacterCastOption(novelId, {
      provider: request.provider,
      model: request.model,
      temperature: request.temperature,
      storyInput,
    }),
  });
  const assessment = dependencies.characterPreparationService.assessCharacterCastOptions([targetOption], storyInput);
  if (assessment.autoApplicableOptionId !== targetOption.id) {
    const blockedSession = buildDirectorSessionState({
      runMode: request.runMode,
      phase: "character_setup",
      isBackgroundRunning: false,
    });
    await dependencies.workflowService.recordCheckpoint(taskId, {
      stage: "character_setup",
      checkpointType: "character_setup_required",
      checkpointSummary: [
        "角色阵容候选已生成，但当前自动质量闸未通过，不能直接自动应用。",
        buildCharacterCastBlockedMessage(assessment),
      ].join("\n"),
      itemLabel: "等待审核角色准备",
      progress: DIRECTOR_PROGRESS.characterSetup,
      seedPayload: callbacks.buildDirectorSeedPayload(request, novelId, {
        directorSession: blockedSession,
        resumeTarget,
      }),
    });
    return true;
  }
  await runDirectorTrackedStep({
    taskId,
    stage: "character_setup",
    itemKey: "character_cast_apply",
    itemLabel: `正在应用角色阵容「${targetOption.title}」`,
    progress: DIRECTOR_PROGRESS.characterSetupReady,
    callbacks,
    run: async () => {
      await dependencies.characterPreparationService.applyCharacterCastOption(novelId, targetOption.id);
    },
  });

  if (normalizeDirectorRunMode(request.runMode) !== "stage_review") {
    return false;
  }

  const pausedSession = buildDirectorSessionState({
    runMode: request.runMode,
    phase: "character_setup",
    isBackgroundRunning: false,
  });
  await dependencies.workflowService.recordCheckpoint(taskId, {
    stage: "character_setup",
    checkpointType: "character_setup_required",
    checkpointSummary: `角色准备已生成并应用「${targetOption.title}」。建议先检查核心角色、关系与当前目标，再继续自动导演。`,
    itemLabel: "等待审核角色准备",
    progress: DIRECTOR_PROGRESS.characterSetupReady,
    seedPayload: callbacks.buildDirectorSeedPayload(request, novelId, {
      directorSession: pausedSession,
      resumeTarget,
    }),
  });
  return true;
}

export async function runDirectorVolumeStrategyPhase(input: {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  dependencies: DirectorPhaseDependencies;
  callbacks: DirectorPhaseCallbacks;
}): Promise<VolumePlanDocument | null> {
  const { taskId, novelId, request, dependencies, callbacks } = input;
  const directorSession = buildDirectorSessionState({
    runMode: request.runMode,
    phase: "volume_strategy",
    isBackgroundRunning: true,
  });
  const resumeTarget = buildNovelEditResumeTarget({
    novelId,
    taskId,
    stage: "outline",
  });
  await dependencies.workflowService.bootstrapTask({
    workflowTaskId: taskId,
    novelId,
    lane: "auto_director",
    title: request.candidate.workingTitle,
    seedPayload: callbacks.buildDirectorSeedPayload(request, novelId, {
      directorSession,
      resumeTarget,
    }),
  });
  let workspace = await runDirectorTrackedStep({
    taskId,
    stage: "volume_strategy",
    itemKey: "volume_strategy",
    itemLabel: "正在生成卷战略",
    progress: DIRECTOR_PROGRESS.volumeStrategy,
    callbacks,
    run: async ({ updateStatus }) => dependencies.volumeService.generateVolumes(novelId, {
      provider: request.provider,
      model: request.model,
      temperature: request.temperature,
      scope: "strategy",
      estimatedChapterCount: request.estimatedChapterCount ?? toBookSpec(request.candidate, request.idea, request.estimatedChapterCount).targetChapterCount,
      onPhaseStart: async (event) => {
        const update = buildVolumeStrategyPhaseUpdate(event);
        if (!update) {
          return;
        }
        await updateStatus(update);
      },
    }),
  });
  workspace = await runDirectorTrackedStep({
    taskId,
    stage: "volume_strategy",
    itemKey: "volume_skeleton",
    itemLabel: "正在生成卷骨架",
    progress: DIRECTOR_PROGRESS.volumeSkeleton,
    callbacks,
    run: async ({ updateStatus }) => dependencies.volumeService.generateVolumes(novelId, {
      provider: request.provider,
      model: request.model,
      temperature: request.temperature,
      scope: "skeleton",
      estimatedChapterCount: request.estimatedChapterCount ?? toBookSpec(request.candidate, request.idea, request.estimatedChapterCount).targetChapterCount,
      draftWorkspace: workspace,
      onPhaseStart: async (event) => {
        const update = buildVolumeStrategyPhaseUpdate(event);
        if (!update) {
          return;
        }
        await updateStatus(update);
      },
    }),
  });
  const persistedStrategyWorkspace = await dependencies.volumeService.updateVolumes(novelId, workspace);

  if (normalizeDirectorRunMode(request.runMode) !== "stage_review") {
    return persistedStrategyWorkspace;
  }

  const pausedSession = buildDirectorSessionState({
    runMode: request.runMode,
    phase: "volume_strategy",
    isBackgroundRunning: false,
  });
  await dependencies.workflowService.recordCheckpoint(taskId, {
    stage: "volume_strategy",
    checkpointType: "volume_strategy_ready",
    checkpointSummary: `卷战略与卷骨架已生成，共 ${persistedStrategyWorkspace.volumes.length} 卷。确认无误后再继续第 1 卷节奏与拆章。`,
    itemLabel: "等待审核卷战略 / 卷骨架",
    progress: DIRECTOR_PROGRESS.volumeStrategyReady,
    seedPayload: callbacks.buildDirectorSeedPayload(request, novelId, {
      directorSession: pausedSession,
      resumeTarget,
    }),
  });
  return null;
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
  const preparedVolumeIds: string[] = [];
  let maxPreparedChapterOrder = 0;

  for (const volume of sortedVolumes) {
    if (detailPlan.mode === "front10" && preparedVolumeIds.length > 0) {
      break;
    }
    if (detailPlan.mode === "volume" && volume.sortOrder > (detailPlan.volumeOrder ?? 1)) {
      break;
    }
    if (detailPlan.mode === "chapter_range" && maxPreparedChapterOrder >= (detailPlan.endOrder ?? 1)) {
      break;
    }

    workspace = await runDirectorTrackedStep({
      taskId,
      stage: "structured_outline",
      itemKey: "beat_sheet",
      itemLabel: `正在生成第 ${volume.sortOrder} 卷节奏板`,
      progress: DIRECTOR_PROGRESS.beatSheet,
      callbacks,
      run: async ({ updateStatus }) => dependencies.volumeService.generateVolumes(novelId, {
        provider: request.provider,
        model: request.model,
        temperature: request.temperature,
        scope: "beat_sheet",
        targetVolumeId: volume.id,
        draftWorkspace: workspace,
        onPhaseStart: async (event) => {
          const update = buildStructuredOutlinePhaseUpdate(event);
          if (!update) {
            return;
          }
          await updateStatus(update);
        },
      }),
    });
    workspace = await runDirectorTrackedStep({
      taskId,
      stage: "structured_outline",
      itemKey: "chapter_list",
      itemLabel: `正在生成第 ${volume.sortOrder} 卷章节列表`,
      progress: DIRECTOR_PROGRESS.chapterList,
      callbacks,
      run: async ({ updateStatus }) => dependencies.volumeService.generateVolumes(novelId, {
        provider: request.provider,
        model: request.model,
        temperature: request.temperature,
        scope: "chapter_list",
        targetVolumeId: volume.id,
        draftWorkspace: workspace,
        onPhaseStart: async (event) => {
          const update = buildStructuredOutlinePhaseUpdate(event);
          if (!update) {
            return;
          }
          await updateStatus(update);
        },
      }),
    });
    preparedVolumeIds.push(volume.id);
    maxPreparedChapterOrder = Math.max(
      0,
      ...flattenPreparedOutlineChapters(workspace).map((chapter) => chapter.chapterOrder),
    );
  }
  if (detailPlan.mode === "chapter_range" && maxPreparedChapterOrder < (detailPlan.endOrder ?? 1)) {
    throw new Error(
      `当前已生成的章节规划最多只覆盖到第 ${maxPreparedChapterOrder} 章，不能直接自动执行第 ${detailPlan.startOrder}-${detailPlan.endOrder} 章。`,
    );
  }

  await callbacks.markDirectorTaskRunning(
    taskId,
    "structured_outline",
    "chapter_sync",
    "正在同步已准备章节到执行区",
    DIRECTOR_PROGRESS.chapterSync,
  );
  let persistedOutlineWorkspace = await dependencies.volumeService.updateVolumes(novelId, workspace);
  await dependencies.volumeService.syncVolumeChapters(novelId, {
    volumes: persistedOutlineWorkspace.volumes,
    preserveContent: true,
    applyDeletes: false,
  });

  const selectedChapters = selectPreparedOutlineChapters(persistedOutlineWorkspace, request);
  if (selectedChapters.length === 0) {
    throw new Error("自动导演未能准备出可执行的章节范围。");
  }
  const autoExecutionScopeLabel = buildDirectorAutoExecutionScopeLabel(
    detailPlan,
    selectedChapters.length,
    detailPlan.mode === "volume" ? selectedChapters[0]?.volumeTitle ?? null : null,
  );
  const totalDetailSteps = selectedChapters.length * DIRECTOR_CHAPTER_DETAIL_MODES.length;
  let completedDetailSteps = 0;

  for (const [chapterIndex, chapter] of selectedChapters.entries()) {
    for (const detailMode of DIRECTOR_CHAPTER_DETAIL_MODES) {
      await callbacks.markDirectorTaskRunning(
        taskId,
        "structured_outline",
        "chapter_detail_bundle",
        buildChapterDetailBundleLabel(chapterIndex + 1, selectedChapters.length, detailMode),
        buildChapterDetailBundleProgress(completedDetailSteps, totalDetailSteps),
      );
      workspace = await dependencies.volumeService.generateVolumes(novelId, {
        provider: request.provider,
        model: request.model,
        temperature: request.temperature,
        scope: "chapter_detail",
        targetVolumeId: chapter.volumeId,
        targetChapterId: chapter.id,
        detailMode,
        draftWorkspace: persistedOutlineWorkspace,
      });
      persistedOutlineWorkspace = workspace;
      completedDetailSteps += 1;
    }
  }

  await callbacks.markDirectorTaskRunning(
    taskId,
    "structured_outline",
    "chapter_detail_bundle",
    `${autoExecutionScopeLabel}细化已完成，正在同步章节执行资源`,
    DIRECTOR_PROGRESS.chapterDetailDone,
  );
  persistedOutlineWorkspace = await dependencies.volumeService.updateVolumes(novelId, persistedOutlineWorkspace);
  await dependencies.volumeService.syncVolumeChapters(novelId, {
    volumes: persistedOutlineWorkspace.volumes,
    preserveContent: true,
    applyDeletes: false,
  });
  const persistedChapters = await dependencies.novelContextService.listChapters(novelId);
  if (persistedChapters.length === 0) {
    throw new Error("自动导演已生成拆章结果，但章节资源没有成功同步到执行区。");
  }

  await dependencies.novelContextService.updateNovel(novelId, {
    projectStatus: "in_progress",
    storylineStatus: "in_progress",
    outlineStatus: "in_progress",
  });

  const selectedChapterOrders = selectedChapters.map((chapter) => chapter.chapterOrder).sort((left, right) => left - right);
  const autoExecutionState = buildDirectorAutoExecutionState({
    range: {
      startOrder: selectedChapterOrders[0] ?? 1,
      endOrder: selectedChapterOrders[selectedChapterOrders.length - 1] ?? selectedChapterOrders[0] ?? 1,
      totalChapterCount: selectedChapters.length,
      firstChapterId: selectedChapters[0]?.id ?? null,
    },
    chapters: persistedChapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
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
}
