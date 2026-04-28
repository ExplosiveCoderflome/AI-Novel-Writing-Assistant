import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { buildCharacterCastBlockedMessage } from "../characterPrep/characterCastQuality";
import type { VolumeGenerationPhaseEvent } from "../volume/volumeModels";
import { buildNovelEditResumeTarget } from "../workflow/novelWorkflow.shared";
import {
  buildRouteFollowingDirectorLlmOptions,
  buildDirectorSessionState,
  buildStoryInput,
  normalizeDirectorRunMode,
  toBookSpec,
} from "./novelDirectorHelpers";
import {
  DIRECTOR_PROGRESS,
  type DirectorProgressItemKey,
} from "./novelDirectorProgress";
import {
  normalizeDirectorAutoApprovalConfig,
  shouldAutoApproveDirectorCheckpoint,
} from "@ai-novel/shared/types/autoDirectorApproval";
import { recordAutoDirectorAutoApproval } from "../../task/autoDirectorFollowUps/autoDirectorAutoApprovalAudit";
import { runDirectorTrackedStep } from "./directorProgressTracker";
import type { DirectorPhaseCallbacks, DirectorPhaseDependencies } from "./novelDirectorPhaseTypes";
export { runDirectorStructuredOutlinePhase } from "./novelDirectorStructuredOutlinePhase";

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
  const routeLlmOptions = buildRouteFollowingDirectorLlmOptions(request);
  const reusableOption = await dependencies.characterPreparationService.findReusableCharacterCastOption?.(novelId) ?? null;
  const targetOption = reusableOption ?? await runDirectorTrackedStep({
    taskId,
    stage: "character_setup",
    itemKey: "character_setup",
    itemLabel: "正在生成角色阵容",
    progress: DIRECTOR_PROGRESS.characterSetup,
    callbacks,
    run: async () => dependencies.characterPreparationService.generateAutoCharacterCastOption(novelId, {
      ...routeLlmOptions,
      storyInput,
    }),
  });
  if (reusableOption) {
    await callbacks.markDirectorTaskRunning(
      taskId,
      "character_setup",
      "character_cast_apply",
      targetOption.status === "applied"
        ? `复用可直接使用的角色阵容「${targetOption.title}」`
        : `复用候选角色阵容「${targetOption.title}」`,
      DIRECTOR_PROGRESS.characterSetupReady,
    );
  }
  if (targetOption.status === "applied") {
    return false;
  }
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
  if (shouldAutoApproveDirectorCheckpoint(
    normalizeDirectorAutoApprovalConfig(request.autoApproval),
    "character_setup_required",
  )) {
    await recordAutoDirectorAutoApproval({
      taskId,
      novelId,
      novelTitle: request.candidate.workingTitle,
      checkpointType: "character_setup_required",
      checkpointSummary: `角色准备已生成并应用「${targetOption.title}」。`,
      stage: "character_setup",
    });
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
  const routeLlmOptions = buildRouteFollowingDirectorLlmOptions(request);
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
    run: async ({ updateStatus, signal }) => dependencies.volumeService.generateVolumes(novelId, {
      ...routeLlmOptions,
      scope: "strategy",
      estimatedChapterCount: request.estimatedChapterCount ?? toBookSpec(request.candidate, request.idea, request.estimatedChapterCount).targetChapterCount,
      signal,
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
    run: async ({ updateStatus, signal }) => dependencies.volumeService.generateVolumes(novelId, {
      ...routeLlmOptions,
      scope: "skeleton",
      estimatedChapterCount: request.estimatedChapterCount ?? toBookSpec(request.candidate, request.idea, request.estimatedChapterCount).targetChapterCount,
      draftWorkspace: workspace,
      signal,
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
  if (shouldAutoApproveDirectorCheckpoint(
    normalizeDirectorAutoApprovalConfig(request.autoApproval),
    "volume_strategy_ready",
  )) {
    await recordAutoDirectorAutoApproval({
      taskId,
      novelId,
      novelTitle: request.candidate.workingTitle,
      checkpointType: "volume_strategy_ready",
      checkpointSummary: `卷战略与卷骨架已生成，共 ${persistedStrategyWorkspace.volumes.length} 卷。`,
      stage: "volume_strategy",
    });
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
