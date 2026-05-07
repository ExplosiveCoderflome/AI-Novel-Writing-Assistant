import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { normalizeDirectorAutoApprovalConfig, shouldAutoApproveDirectorCheckpoint } from "@ai-novel/shared/types/autoDirectorApproval";
import type { NovelVolumeService } from "../novel/volume/NovelVolumeService";
import { recordAutoDirectorAutoApprovalFromTask } from "../task/autoDirectorFollowUps/autoDirectorAutoApprovalAudit";
import { normalizeDirectorMemoryScope } from "./autoMemorySafety";
import { NovelDirectorAutoExecutionRuntime } from "./autoExecutionRuntime";
import { directorExecutionLogger } from "./executionLogger";

export interface DirectorPipelineRunnerDeps {
  volumeService: NovelVolumeService;
  autoExecutionRuntime: NovelDirectorAutoExecutionRuntime;
}

export interface DirectorPipelineRunnerCallbacks {
  resolveSafePipelineStartPhase: (input: {
    novelId: string;
    requestedPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
  }) => Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline">;
  runStoryMacroPhase: (taskId: string, novelId: string, input: DirectorConfirmRequest) => Promise<void>;
  runCharacterSetupPhase: (taskId: string, novelId: string, input: DirectorConfirmRequest) => Promise<boolean>;
  runVolumeStrategyPhase: (
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ) => Promise<Awaited<ReturnType<NovelVolumeService["getVolumes"]>> | null>;
  runStructuredOutlinePhase: (
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
    baseWorkspace: Awaited<ReturnType<NovelVolumeService["getVolumes"]>>,
  ) => Promise<void>;
  assertHighMemoryDirectorStartAllowed: (input: {
    taskId: string;
    novelId: string;
    stage: "structured_outline";
    itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
    volumeId?: string | null;
    chapterId?: string | null;
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }) => Promise<void>;
  shouldAutoApproveCheckpoint: (
    input: DirectorConfirmRequest,
    checkpointType: "front10_ready" | "chapter_batch_ready" | "replan_required",
  ) => boolean;
}

export function shouldAutoApproveCheckpoint(
  input: DirectorConfirmRequest,
  checkpointType: "front10_ready" | "chapter_batch_ready" | "replan_required",
): boolean {
  if (Object.prototype.hasOwnProperty.call(input, "autoApproval")) {
    return shouldAutoApproveDirectorCheckpoint(
      normalizeDirectorAutoApprovalConfig(input.autoApproval),
      checkpointType,
    );
  }
  return checkpointType === "front10_ready" && input.runMode === "auto_to_execution";
}

export async function runDirectorPipeline(
  deps: DirectorPipelineRunnerDeps,
  callbacks: DirectorPipelineRunnerCallbacks,
  input: {
    taskId: string;
    novelId: string;
    input: DirectorConfirmRequest;
    startPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  },
): Promise<void> {
  const safeStartPhase = await callbacks.resolveSafePipelineStartPhase({
    novelId: input.novelId,
    requestedPhase: input.startPhase,
  });

  if (safeStartPhase === "story_macro") {
    directorExecutionLogger.info(input.taskId, "story_macro", "开始生成故事宏观规划", { novelId: input.novelId }).catch(() => {});
    await callbacks.runStoryMacroPhase(input.taskId, input.novelId, input.input);
    directorExecutionLogger.success(input.taskId, "story_macro", "故事宏观规划完成", { novelId: input.novelId }).catch(() => {});
  }

  if (safeStartPhase === "story_macro" || safeStartPhase === "character_setup") {
    directorExecutionLogger.info(input.taskId, "character_setup", "开始角色配置", { novelId: input.novelId }).catch(() => {});
    const paused = await callbacks.runCharacterSetupPhase(input.taskId, input.novelId, input.input);
    if (paused) {
      directorExecutionLogger.warn(input.taskId, "character_setup", "角色配置需要人工确认，已暂停", { novelId: input.novelId }).catch(() => {});
      return;
    }
    directorExecutionLogger.success(input.taskId, "character_setup", "角色配置完成", { novelId: input.novelId }).catch(() => {});
  }

  if (
    safeStartPhase === "story_macro"
    || safeStartPhase === "character_setup"
    || safeStartPhase === "volume_strategy"
  ) {
    directorExecutionLogger.info(input.taskId, "volume_strategy", "开始生成卷战略规划", { novelId: input.novelId }).catch(() => {});
    const volumeWorkspace = await callbacks.runVolumeStrategyPhase(input.taskId, input.novelId, input.input);
    if (!volumeWorkspace) {
      directorExecutionLogger.warn(input.taskId, "volume_strategy", "卷战略规划未能完成", { novelId: input.novelId }).catch(() => {});
      return;
    }
    directorExecutionLogger.success(input.taskId, "volume_strategy", `卷战略规划完成，共 ${volumeWorkspace.volumes.length} 卷`, { novelId: input.novelId }).catch(() => {});
    await callbacks.assertHighMemoryDirectorStartAllowed({
      taskId: input.taskId,
      novelId: input.novelId,
      stage: "structured_outline",
      itemKey: "chapter_list",
      volumeId: volumeWorkspace.volumes[0]?.id,
      scope: normalizeDirectorMemoryScope({
        volumeId: volumeWorkspace.volumes[0]?.id,
        fallback: input.scope ?? "book",
      }),
      batchAlreadyStartedCount: input.batchAlreadyStartedCount,
    });
    directorExecutionLogger.info(input.taskId, "structured_outline", "开始生成章节大纲", { novelId: input.novelId }).catch(() => {});
    await callbacks.runStructuredOutlinePhase(input.taskId, input.novelId, input.input, volumeWorkspace);
    directorExecutionLogger.success(input.taskId, "structured_outline", "章节大纲生成完成，规划阶段就绪", { novelId: input.novelId }).catch(() => {});
    if (callbacks.shouldAutoApproveCheckpoint(input.input, "front10_ready")) {
      directorExecutionLogger.info(input.taskId, "front10_ready", "自动批准规划检查点，进入章节执行阶段", { novelId: input.novelId }).catch(() => {});
      await recordAutoDirectorAutoApprovalFromTask({
        taskId: input.taskId,
        checkpointType: "front10_ready",
      });
      await deps.autoExecutionRuntime.runFromReady({
        taskId: input.taskId,
        novelId: input.novelId,
        request: input.input,
        resumeCheckpointType: "front10_ready",
      });
    }
    return;
  }

  const currentWorkspace = await deps.volumeService.getVolumes(input.novelId);
  await callbacks.assertHighMemoryDirectorStartAllowed({
    taskId: input.taskId,
    novelId: input.novelId,
    stage: "structured_outline",
    itemKey: "chapter_list",
    volumeId: currentWorkspace.volumes[0]?.id,
    scope: normalizeDirectorMemoryScope({
      volumeId: currentWorkspace.volumes[0]?.id,
      fallback: input.scope ?? "book",
    }),
    batchAlreadyStartedCount: input.batchAlreadyStartedCount,
  });
  await callbacks.runStructuredOutlinePhase(input.taskId, input.novelId, input.input, currentWorkspace);
  if (callbacks.shouldAutoApproveCheckpoint(input.input, "front10_ready")) {
    await recordAutoDirectorAutoApprovalFromTask({
      taskId: input.taskId,
      checkpointType: "front10_ready",
    });
    await deps.autoExecutionRuntime.runFromReady({
      taskId: input.taskId,
      novelId: input.novelId,
      request: input.input,
      resumeCheckpointType: "front10_ready",
    });
  }
}
