import type {
  DirectorArtifactRef,
} from "@ai-novel/shared/types/directorRuntime";
import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";
import { AppError } from "../../../middleware/errorHandler";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import type { DirectorRuntimeService } from "./runtime/DirectorRuntimeService";
import type { NovelDirectorAutoExecutionRuntime } from "./novelDirectorAutoExecutionRuntime";
import type { DirectorProgressItemKey } from "./novelDirectorProgress";

export class DirectorRuntimeGateError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = "DirectorRuntimeGateError";
  }
}

export function isDirectorRuntimeGateError(error: unknown): boolean {
  return error instanceof DirectorRuntimeGateError;
}

export class NovelDirectorRuntimeOrchestrator {
  constructor(private readonly deps: {
    directorRuntime: DirectorRuntimeService;
    workflowService: Pick<NovelWorkflowService, "markTaskRunning" | "markTaskWaitingApproval">;
    autoExecutionRuntime: NovelDirectorAutoExecutionRuntime;
  }) {}

  async markTaskRunning(
    taskId: string,
    stage: NovelWorkflowStage,
    itemKey: DirectorProgressItemKey,
    itemLabel: string,
    progress: number,
    options?: {
      chapterId?: string | null;
      volumeId?: string | null;
      novelId?: string | null;
    },
  ): Promise<void> {
    await this.deps.workflowService.markTaskRunning(taskId, {
      stage,
      itemKey,
      itemLabel,
      progress,
      chapterId: options?.chapterId,
      volumeId: options?.volumeId,
    });
    await this.deps.directorRuntime.recordStepStarted({
      taskId,
      novelId: options?.novelId,
      nodeKey: `${stage}.${itemKey}`,
      label: itemLabel,
      targetType: options?.chapterId ? "chapter" : options?.volumeId ? "volume" : "global",
      targetId: options?.chapterId ?? options?.volumeId ?? null,
    });
  }

  async refreshWorkspaceAfterNode(input: {
    taskId: string;
    novelId: string;
    nodeKey: string;
    label: string;
    artifacts?: DirectorArtifactRef[];
  }): Promise<void> {
    const analysis = await this.deps.directorRuntime.analyzeWorkspace({
      novelId: input.novelId,
      workflowTaskId: input.taskId,
      includeAiInterpretation: false,
    });
    await this.deps.directorRuntime.recordStepCompleted({
      taskId: input.taskId,
      novelId: input.novelId,
      nodeKey: input.nodeKey,
      label: input.label,
      targetType: "global",
      producedArtifacts: input.artifacts ?? analysis.inventory.artifacts,
    });
  }

  async runNode<T>(input: {
    taskId: string;
    novelId?: string | null;
    nodeKey: string;
    label: string;
    reads: string[];
    writes: string[];
    mayModifyUserContent?: boolean;
    requiresApprovalByDefault?: boolean;
    supportsAutoRetry?: boolean;
    targetType?: DirectorArtifactRef["targetType"] | null;
    targetId?: string | null;
    waitingState?: {
      stage: NovelWorkflowStage;
      itemKey?: string | null;
      itemLabel?: string | null;
      progress?: number;
    };
    runner: () => Promise<T>;
    collectArtifacts?: (output: T) => Promise<DirectorArtifactRef[]> | DirectorArtifactRef[];
  }): Promise<T> {
    const result = await this.deps.directorRuntime.runNode<void, {
      output: T;
      artifacts: DirectorArtifactRef[];
    }>(
      {
        nodeKey: input.nodeKey,
        label: input.label,
        reads: input.reads,
        writes: input.writes,
        mayModifyUserContent: input.mayModifyUserContent ?? false,
        requiresApprovalByDefault: input.requiresApprovalByDefault ?? false,
        supportsAutoRetry: input.supportsAutoRetry ?? false,
        run: async () => {
          const output = await input.runner();
          const artifacts = input.collectArtifacts
            ? await input.collectArtifacts(output)
            : await this.collectArtifactsAfterNode({
              taskId: input.taskId,
              novelId: input.novelId,
            });
          return { output, artifacts };
        },
      },
      {
        taskId: input.taskId,
        novelId: input.novelId,
        targetType: input.targetType ?? "global",
        targetId: input.targetId ?? null,
        payload: undefined,
      },
      (output) => output.artifacts,
    );

    if (result.status === "completed" && result.output) {
      return result.output.output;
    }

    const reason = result.reason ?? "当前自动导演策略需要确认后继续。";
    if (input.waitingState) {
      await this.deps.workflowService.markTaskWaitingApproval(input.taskId, {
        stage: input.waitingState.stage,
        itemKey: input.waitingState.itemKey ?? input.nodeKey,
        itemLabel: input.waitingState.itemLabel ?? reason,
        progress: input.waitingState.progress,
        checkpointSummary: reason,
      });
    }
    throw new DirectorRuntimeGateError(reason);
  }

  async runChapterExecutionNode(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
    existingState?: DirectorAutoExecutionState | null;
    resumeCheckpointType?: "front10_ready" | "chapter_batch_ready" | "replan_required" | null;
    resumeStage?: "chapter" | "pipeline";
    previousFailureMessage?: string | null;
    allowSkipReviewBlockedChapter?: boolean;
  }): Promise<void> {
    const isQualityRepair = input.resumeCheckpointType === "replan_required";
    await this.runNode({
      taskId: input.taskId,
      novelId: input.novelId,
      nodeKey: isQualityRepair ? "chapter_quality_repair_node" : "chapter_execution_node",
      label: isQualityRepair ? "执行章节质量修复" : "执行章节生成批次",
      targetType: "novel",
      targetId: input.novelId,
      reads: ["chapter_task_sheet", "chapter_draft", "audit_report"],
      writes: isQualityRepair
        ? ["chapter_draft", "audit_report", "repair_ticket"]
        : ["chapter_draft", "audit_report"],
      mayModifyUserContent: false,
      supportsAutoRetry: isQualityRepair,
      waitingState: {
        stage: isQualityRepair ? "quality_repair" : "chapter_execution",
        itemKey: isQualityRepair ? "quality_repair" : "chapter_execution",
        itemLabel: isQualityRepair ? "等待确认章节修复" : "等待确认章节执行",
        progress: isQualityRepair ? 0.975 : 0.93,
      },
      runner: () => this.deps.autoExecutionRuntime.runFromReady(input),
    });
  }

  private async collectArtifactsAfterNode(input: {
    taskId: string;
    novelId?: string | null;
  }): Promise<DirectorArtifactRef[]> {
    if (!input.novelId) {
      return [];
    }
    const analysis = await this.deps.directorRuntime.analyzeWorkspace({
      novelId: input.novelId,
      workflowTaskId: input.taskId,
      includeAiInterpretation: false,
    });
    return analysis.inventory.artifacts;
  }
}
