import type {
  DirectorArtifactRef,
  DirectorStepRun,
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
import { buildDefaultDirectorPolicy } from "./runtime/directorRuntimeDefaults";
import type { NovelDirectorAutoExecutionRuntime } from "./novelDirectorAutoExecutionRuntime";
import type { DirectorProgressItemKey } from "./novelDirectorProgress";
import {
  isExecutableWorkflowStepModule,
  type WorkflowStepModule,
  type WorkflowStepModuleDescriptor,
} from "./workflowStepRuntime/WorkflowStepModule";
import { buildChapterPipelineWorkflowTemplate } from "./workflowStepRuntime/directorWorkflowPlans";
import { directorWorkflowStepModuleRegistry } from "./workflowStepRuntime/directorWorkflowStepModules";
import { isInitializationPlaceholderVolumeStrategyArtifact } from "./runtime/DirectorWorkspaceArtifactInventory";
import { DirectorStateCommitter } from "./DirectorStateCommitter";

export class DirectorRuntimeGateError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = "DirectorRuntimeGateError";
  }
}

export function isDirectorRuntimeGateError(error: unknown): boolean {
  return error instanceof DirectorRuntimeGateError;
}

function isExecutableModuleContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Director workflow task not found.")
    || message.includes("Director step module requires persisted director input.")
    || message.includes("Director step module requires a bound novel.")
    || message.includes("Director step module requires task context.")
  );
}

function filterArtifactsByWrites(
  artifacts: DirectorArtifactRef[],
  writes: string[],
): DirectorArtifactRef[] {
  if (writes.length === 0 || artifacts.length === 0) {
    return [];
  }
  const writeTypes = new Set(writes);
  return artifacts.filter((artifact) => writeTypes.has(artifact.artifactType));
}

function filterPolicyAffectedArtifacts(
  artifacts: DirectorArtifactRef[],
): DirectorArtifactRef[] {
  return artifacts.filter((artifact) => !isInitializationPlaceholderVolumeStrategyArtifact(artifact));
}

export class NovelDirectorRuntimeOrchestrator {
  private readonly stateCommitter = new DirectorStateCommitter();

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
    approveCurrentGate?: boolean;
    approveAutoExecutionScope?: boolean;
    targetType?: DirectorArtifactRef["targetType"] | null;
    targetId?: string | null;
    reuseCompletedStep?: boolean;
    waitingState?: {
      stage: NovelWorkflowStage;
      itemKey?: string | null;
      itemLabel?: string | null;
      progress?: number;
    };
    runner: () => Promise<T>;
    collectArtifacts?: (output: T) => Promise<DirectorArtifactRef[]> | DirectorArtifactRef[];
  }): Promise<T> {
    const affectedArtifacts = input.mayModifyUserContent
      ? await this.collectAffectedArtifactsBeforeNode({
        taskId: input.taskId,
        novelId: input.novelId,
        writes: input.writes,
        targetType: input.targetType ?? "global",
        targetId: input.targetId ?? null,
      })
      : [];
    const policy = await this.resolveNodePolicyOverride({
      taskId: input.taskId,
      nodeKey: input.nodeKey,
      targetType: input.targetType ?? "global",
      targetId: input.targetId ?? null,
      affectedArtifacts,
      approveCurrentGate: input.approveCurrentGate ?? false,
      approveAutoExecutionScope: input.approveAutoExecutionScope ?? false,
    });
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
          return { output, artifacts: filterArtifactsByWrites(artifacts, input.writes) };
        },
      },
      {
        taskId: input.taskId,
        novelId: input.novelId,
        targetType: input.targetType ?? "global",
        targetId: input.targetId ?? null,
        payload: undefined,
        policy,
        reuseCompletedStep: input.reuseCompletedStep,
      },
      (output) => output.artifacts,
    );

    if (result.status === "completed") {
      return result.output?.output as T;
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

  async runStepModule<T>(input: {
    module: WorkflowStepModuleDescriptor;
    taskId: string;
    novelId?: string | null;
    targetType?: DirectorArtifactRef["targetType"] | null;
    targetId?: string | null;
    approveCurrentGate?: boolean;
    approveAutoExecutionScope?: boolean;
    reuseCompletedStep?: boolean;
    runner?: () => Promise<T>;
    collectArtifacts?: (output: T) => Promise<DirectorArtifactRef[]> | DirectorArtifactRef[];
  }): Promise<T> {
    if (isExecutableWorkflowStepModule(input.module)) {
      try {
        return await this.runExecutableStepModule({
          ...input,
          module: input.module,
        }) as T;
      } catch (error) {
        if (!input.runner || !isExecutableModuleContextError(error)) {
          throw error;
        }
      }
    }
    if (!input.runner) {
      throw new Error(`Workflow step module ${input.module.id} requires an explicit runner.`);
    }
    return this.runNode({
      nodeKey: input.module.nodeKey,
      label: input.module.label,
      reads: input.module.reads,
      writes: input.module.writes,
      policyAction: input.module.policyAction,
      mayModifyUserContent: input.module.mayModifyUserContent,
      requiresApprovalByDefault: input.module.requiresApprovalByDefault,
      supportsAutoRetry: input.module.supportsAutoRetry,
      approveCurrentGate: input.approveCurrentGate,
      approveAutoExecutionScope: input.approveAutoExecutionScope,
      reuseCompletedStep: input.reuseCompletedStep,
      targetType: input.targetType ?? input.module.targetType,
      targetId: input.targetId,
      waitingState: input.module.defaultWaitingState,
      taskId: input.taskId,
      novelId: input.novelId,
      runner: input.runner,
      collectArtifacts: input.collectArtifacts,
    });
  }

  private async runExecutableStepModule<TOutput>(input: {
    module: WorkflowStepModule<unknown, TOutput>;
    taskId: string;
    novelId?: string | null;
    targetType?: DirectorArtifactRef["targetType"] | null;
    targetId?: string | null;
    approveCurrentGate?: boolean;
    approveAutoExecutionScope?: boolean;
    reuseCompletedStep?: boolean;
  }): Promise<TOutput> {
    const context = {
      taskId: input.taskId,
      novelId: input.novelId,
      targetType: input.targetType ?? input.module.targetType,
      targetId: input.targetId ?? null,
    };
    const completion = await input.module.inspectCompletion(context);
    if (completion.completed) {
      return undefined as TOutput;
    }
    const readiness = await input.module.inspectReadiness(context);
    if (!readiness.ready) {
      const blocker = readiness.blockers[0] ?? null;
      const reason = blocker?.reason || input.module.defaultWaitingState?.itemLabel || "当前导演步骤需要补齐上游条件。";
      if (input.module.defaultWaitingState) {
        await this.deps.workflowService.markTaskWaitingApproval(input.taskId, {
          stage: input.module.defaultWaitingState.stage,
          itemKey: input.module.defaultWaitingState.itemKey ?? input.module.nodeKey,
          itemLabel: input.module.defaultWaitingState.itemLabel ?? reason,
          progress: input.module.defaultWaitingState.progress,
          checkpointSummary: reason,
        });
      }
      await this.stateCommitter.markRuntimeWaitingGate({
        runtimeId: null,
        taskId: input.taskId,
        novelId: input.novelId,
        message: reason,
      });
      throw new DirectorRuntimeGateError(reason);
    }

    const builtInput = await input.module.buildInput(context);
    const preconditions = input.module.validatePreconditions
      ? await input.module.validatePreconditions(builtInput, context)
      : { status: "ready" as const };
    if (preconditions.status !== "ready") {
      const reason = preconditions.reason;
      if (input.module.defaultWaitingState) {
        await this.deps.workflowService.markTaskWaitingApproval(input.taskId, {
          stage: input.module.defaultWaitingState.stage,
          itemKey: input.module.defaultWaitingState.itemKey ?? input.module.nodeKey,
          itemLabel: input.module.defaultWaitingState.itemLabel ?? reason,
          progress: input.module.defaultWaitingState.progress,
          checkpointSummary: reason,
        });
      }
      throw new DirectorRuntimeGateError(reason);
    }

    const result = await this.runNode<{
      output: TOutput;
      producedArtifacts: DirectorArtifactRef[];
    }>({
      nodeKey: input.module.nodeKey,
      label: input.module.label,
      reads: input.module.reads,
      writes: input.module.writes,
      policyAction: input.module.policyAction,
      mayModifyUserContent: input.module.mayModifyUserContent,
      requiresApprovalByDefault: input.module.requiresApprovalByDefault,
      supportsAutoRetry: input.module.supportsAutoRetry,
      approveCurrentGate: input.approveCurrentGate,
      approveAutoExecutionScope: input.approveAutoExecutionScope,
      reuseCompletedStep: input.reuseCompletedStep,
      targetType: input.targetType ?? input.module.targetType,
      targetId: input.targetId,
      waitingState: input.module.defaultWaitingState,
      taskId: input.taskId,
      novelId: input.novelId,
      runner: async () => {
        const output = await input.module.execute(builtInput, context);
        const validation = input.module.validateOutput
          ? await input.module.validateOutput(output, context)
          : { valid: true };
        if (!validation.valid) {
          throw new Error(validation.reason || `${input.module.id} produced an invalid output.`);
        }
        const completed = input.module.completeCriteria
          ? await input.module.completeCriteria(output, context)
          : true;
        if (!completed) {
          throw new Error(`${input.module.id} did not satisfy its completion criteria.`);
        }
        const commit = input.module.commit
          ? await input.module.commit(output, context)
          : undefined;
        const producedArtifacts = commit?.producedArtifacts ?? [];
        return {
          output,
          producedArtifacts,
        };
      },
      collectArtifacts: (moduleResult) => moduleResult.producedArtifacts,
    });
    return result.output as TOutput;
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
    approveCurrentGate?: boolean;
    approveAutoExecutionScope?: boolean;
  }): Promise<void> {
    const isQualityRepair = input.resumeCheckpointType === "replan_required";
    const workflowPlan = buildChapterPipelineWorkflowTemplate(
      isQualityRepair ? "quality_repair" : "chapter_execution",
    );
    const nodeSequence = workflowPlan.steps.map((step) => (
      directorWorkflowStepModuleRegistry.get(step.stepId)
    ));
    const [entryAdapter, ...projectionAdapters] = nodeSequence;
    if (!entryAdapter) {
      throw new Error("章节执行节点序列为空，无法继续自动导演运行。");
    }
    await this.runStepModule({
      module: entryAdapter,
      taskId: input.taskId,
      novelId: input.novelId,
      targetId: input.novelId,
      approveCurrentGate: input.approveCurrentGate,
      approveAutoExecutionScope: input.approveAutoExecutionScope,
      reuseCompletedStep: false,
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
      await this.runStepModule({
        module: adapter,
        taskId: input.taskId,
        novelId: input.novelId,
        targetId: input.novelId,
        approveCurrentGate: input.approveCurrentGate,
        approveAutoExecutionScope: input.approveAutoExecutionScope,
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
    }).catch(() => null);
    if (!analysis) {
      return [];
    }
    return analysis.inventory.artifacts;
  }

  private async collectAffectedArtifactsBeforeNode(input: {
    taskId: string;
    novelId?: string | null;
    writes: string[];
    targetType?: DirectorArtifactRef["targetType"] | null;
    targetId?: string | null;
  }): Promise<DirectorArtifactRef[]> {
    if (!input.novelId || input.writes.length === 0) {
      return [];
    }
    const analysis = await this.deps.directorRuntime.analyzeWorkspace({
      novelId: input.novelId,
      workflowTaskId: input.taskId,
      includeAiInterpretation: false,
    }).catch(() => null);
    if (!analysis) {
      return [];
    }
    const writeTypes = new Set(input.writes);
    return filterPolicyAffectedArtifacts(analysis.inventory.artifacts.filter((artifact) => {
      if (!writeTypes.has(artifact.artifactType)) {
        return false;
      }
      if (input.targetType && input.targetType !== "novel" && artifact.targetType !== input.targetType) {
        return false;
      }
      if (input.targetId && input.targetType && input.targetType !== "novel" && artifact.targetId !== input.targetId) {
        return false;
      }
      return artifact.status === "active";
    }));
  }

  private async resolveNodePolicyOverride(input: {
    taskId: string;
    nodeKey: string;
    targetType: DirectorArtifactRef["targetType"];
    targetId?: string | null;
    affectedArtifacts: DirectorArtifactRef[];
    approveCurrentGate: boolean;
    approveAutoExecutionScope: boolean;
  }): Promise<Omit<Partial<DirectorPolicyRequest>, "action"> | undefined> {
    const affectedPolicy = input.affectedArtifacts.length > 0
      ? { affectedArtifacts: input.affectedArtifacts }
      : undefined;
    if (!input.approveCurrentGate && !input.approveAutoExecutionScope) {
      return affectedPolicy;
    }

    const snapshot = await this.deps.directorRuntime.getSnapshot(input.taskId).catch(() => null);
    const approvedGate = [...(snapshot?.steps ?? [])]
      .reverse()
      .find((step) => this.matchesPendingApprovedGate(step, input));
    if (!approvedGate && !input.approveAutoExecutionScope) {
      return affectedPolicy;
    }

    const basePolicy = snapshot?.policy ?? buildDefaultDirectorPolicy();
    return {
      affectedArtifacts: input.affectedArtifacts,
      policy: {
        ...basePolicy,
        mode: "auto_safe_scope",
        mayOverwriteUserContent: input.affectedArtifacts.some((artifact) => artifact.protectedUserContent === true)
          ? false
          : basePolicy.mayOverwriteUserContent,
        allowExpensiveReview: input.approveAutoExecutionScope
          ? true
          : basePolicy.allowExpensiveReview,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  private matchesPendingApprovedGate(
    step: DirectorStepRun,
    input: {
      nodeKey: string;
      targetType: DirectorArtifactRef["targetType"];
      targetId?: string | null;
    },
  ): boolean {
    if (step.status !== "waiting_approval" || step.nodeKey !== input.nodeKey) {
      return false;
    }
    if (step.targetType && step.targetType !== input.targetType) {
      return false;
    }
    if (step.targetId && input.targetId && step.targetId !== input.targetId) {
      return false;
    }
    return true;
  }
}
