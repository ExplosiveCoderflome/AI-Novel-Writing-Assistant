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
import type { DirectorPolicyRequest } from "./runtime/DirectorPolicyEngine";
import type { DirectorRuntimeService } from "./runtime/DirectorRuntimeService";
import type { NovelDirectorAutoExecutionRuntime } from "./novelDirectorAutoExecutionRuntime";
import type { DirectorProgressItemKey } from "./novelDirectorProgress";
import { getDirectorExecutionNodeSequence } from "./novelDirectorExecutionNodeAdapters";

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
    policyAction?: DirectorPolicyRequest["action"];
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
        policyAction: input.policyAction,
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
    const nodeSequence = getDirectorExecutionNodeSequence(
      isQualityRepair ? "quality_repair" : "chapter_execution",
    );
    const [entryAdapter, ...projectionAdapters] = nodeSequence;
    if (!entryAdapter) {
      throw new Error("章节执行节点序列为空，无法继续自动导演运行。");
    }
    await this.runNode({
      ...entryAdapter,
      taskId: input.taskId,
      novelId: input.novelId,
      targetId: input.novelId,
      runner: () => this.deps.autoExecutionRuntime.runFromReady(input),
    });

    if (projectionAdapters.length === 0) {
      return;
    }

    const artifacts = await this.collectArtifactsAfterNode({
      taskId: input.taskId,
      novelId: input.novelId,
    });
    for (const adapter of projectionAdapters) {
      await this.runNode({
        ...adapter,
        taskId: input.taskId,
        novelId: input.novelId,
        targetId: input.novelId,
        runner: async () => undefined,
        collectArtifacts: () => artifacts,
      });
    }
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
