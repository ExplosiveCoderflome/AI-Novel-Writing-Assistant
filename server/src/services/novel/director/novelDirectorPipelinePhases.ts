import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { CharacterPreparationService } from "../characterPrep/CharacterPreparationService";
import { buildCharacterCastBlockedMessage } from "../characterPrep/characterCastQuality";
import { NovelContextService } from "../NovelContextService";
import { NovelVolumeService } from "../volume/NovelVolumeService";
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

type DirectorMutatingStage =
  | "auto_director"
  | "story_macro"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline";

interface DirectorPhaseDependencies {
  workflowService: NovelWorkflowService;
  novelContextService: NovelContextService;
  characterPreparationService: CharacterPreparationService;
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
  await callbacks.markDirectorTaskRunning(
    taskId,
    "character_setup",
    "character_setup",
    "正在生成角色阵容",
    DIRECTOR_PROGRESS.characterSetup,
  );
  const castOptions = await dependencies.characterPreparationService.generateCharacterCastOptions(novelId, {
    provider: request.provider,
    model: request.model,
    temperature: request.temperature,
    storyInput: buildStoryInput(request, toBookSpec(request.candidate, request.idea, request.estimatedChapterCount)),
  });
  const storyInput = buildStoryInput(request, toBookSpec(request.candidate, request.idea, request.estimatedChapterCount));
  const assessment = dependencies.characterPreparationService.assessCharacterCastOptions(castOptions, storyInput);
  const targetOption = assessment.autoApplicableOptionId
    ? castOptions.find((option) => option.id === assessment.autoApplicableOptionId) ?? null
    : null;
  if (!targetOption) {
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
  await callbacks.markDirectorTaskRunning(
    taskId,
    "character_setup",
    "character_cast_apply",
    `正在应用角色阵容「${targetOption.title}」`,
    DIRECTOR_PROGRESS.characterSetupReady,
  );
  await dependencies.characterPreparationService.applyCharacterCastOption(novelId, targetOption.id);

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
  await callbacks.markDirectorTaskRunning(
    taskId,
    "volume_strategy",
    "volume_strategy",
    "正在生成卷战略",
    DIRECTOR_PROGRESS.volumeStrategy,
  );
  let workspace = await dependencies.volumeService.generateVolumes(novelId, {
    provider: request.provider,
    model: request.model,
    temperature: request.temperature,
    scope: "strategy",
    estimatedChapterCount: request.estimatedChapterCount ?? toBookSpec(request.candidate, request.idea, request.estimatedChapterCount).targetChapterCount,
  });
  await callbacks.markDirectorTaskRunning(
    taskId,
    "volume_strategy",
    "volume_skeleton",
    "正在生成卷骨架",
    DIRECTOR_PROGRESS.volumeSkeleton,
  );
  workspace = await dependencies.volumeService.generateVolumes(novelId, {
    provider: request.provider,
    model: request.model,
    temperature: request.temperature,
    scope: "skeleton",
    estimatedChapterCount: request.estimatedChapterCount ?? toBookSpec(request.candidate, request.idea, request.estimatedChapterCount).targetChapterCount,
    draftWorkspace: workspace,
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
  const targetVolume = baseWorkspace.volumes[0];
  if (!targetVolume) {
    throw new Error("自动导演未能生成可用卷骨架。");
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
    volumeId: targetVolume.id,
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

  await callbacks.markDirectorTaskRunning(
    taskId,
    "structured_outline",
    "beat_sheet",
    "正在生成第 1 卷节奏板",
    DIRECTOR_PROGRESS.beatSheet,
  );
  let workspace = await dependencies.volumeService.generateVolumes(novelId, {
    provider: request.provider,
    model: request.model,
    temperature: request.temperature,
    scope: "beat_sheet",
    targetVolumeId: targetVolume.id,
    draftWorkspace: baseWorkspace,
  });
  await callbacks.markDirectorTaskRunning(
    taskId,
    "structured_outline",
    "chapter_list",
    "正在生成第 1 卷章节列表",
    DIRECTOR_PROGRESS.chapterList,
  );
  workspace = await dependencies.volumeService.generateVolumes(novelId, {
    provider: request.provider,
    model: request.model,
    temperature: request.temperature,
    scope: "chapter_list",
    targetVolumeId: targetVolume.id,
    draftWorkspace: workspace,
  });
  await callbacks.markDirectorTaskRunning(
    taskId,
    "structured_outline",
    "chapter_sync",
    "正在同步第 1 卷章节到执行区",
    DIRECTOR_PROGRESS.chapterSync,
  );
  let persistedOutlineWorkspace = await dependencies.volumeService.updateVolumes(novelId, workspace);
  await dependencies.volumeService.syncVolumeChapters(novelId, {
    volumes: persistedOutlineWorkspace.volumes,
    preserveContent: true,
    applyDeletes: false,
  });

  const refreshedTargetVolume = persistedOutlineWorkspace.volumes.find((volume) => volume.id === targetVolume.id)
    ?? persistedOutlineWorkspace.volumes[0];
  if (!refreshedTargetVolume) {
    throw new Error("自动导演未能生成第 1 卷章节列表。");
  }
  if (refreshedTargetVolume.chapters.length === 0) {
    throw new Error("自动导演未能生成可同步的章节列表，当前不能进入章节执行。");
  }

  const frontTenChapters = refreshedTargetVolume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder)
    .slice(0, 10);
  const totalDetailSteps = frontTenChapters.length * DIRECTOR_CHAPTER_DETAIL_MODES.length;
  let completedDetailSteps = 0;

  for (const [chapterIndex, chapter] of frontTenChapters.entries()) {
    for (const detailMode of DIRECTOR_CHAPTER_DETAIL_MODES) {
      await callbacks.markDirectorTaskRunning(
        taskId,
        "structured_outline",
        "chapter_detail_bundle",
        buildChapterDetailBundleLabel(chapterIndex + 1, frontTenChapters.length, detailMode),
        buildChapterDetailBundleProgress(completedDetailSteps, totalDetailSteps),
      );
      workspace = await dependencies.volumeService.generateVolumes(novelId, {
        provider: request.provider,
        model: request.model,
        temperature: request.temperature,
        scope: "chapter_detail",
        targetVolumeId: refreshedTargetVolume.id,
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
    `前 ${frontTenChapters.length} 章细化已完成，正在同步章节执行资源`,
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

  const pausedSession = buildDirectorSessionState({
    runMode: request.runMode,
    phase: "front10_ready",
    isBackgroundRunning: false,
  });
  const chapterResumeTarget = buildNovelEditResumeTarget({
    novelId,
    taskId,
    stage: "chapter",
    volumeId: refreshedTargetVolume.id,
    chapterId: frontTenChapters[0]?.id ?? null,
  });
  await dependencies.workflowService.recordCheckpoint(taskId, {
    stage: "chapter_execution",
    checkpointType: "front10_ready",
    checkpointSummary: `《${request.candidate.workingTitle.trim() || request.title?.trim() || "当前项目"}》已生成第 1 卷节奏板，并准备好前 ${frontTenChapters.length} 章细化。`,
    itemLabel: `前 ${frontTenChapters.length} 章已可进入章节执行`,
    volumeId: refreshedTargetVolume.id,
    chapterId: frontTenChapters[0]?.id ?? null,
    progress: DIRECTOR_PROGRESS.front10Ready,
    seedPayload: callbacks.buildDirectorSeedPayload(request, novelId, {
      directorSession: pausedSession,
      resumeTarget: chapterResumeTarget,
    }),
  });
}
