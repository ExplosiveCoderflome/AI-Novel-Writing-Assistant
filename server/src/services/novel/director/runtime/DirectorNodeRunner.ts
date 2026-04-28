import type {
  DirectorArtifactRef,
  DirectorRuntimeSnapshot,
  DirectorStepRun,
} from "@ai-novel/shared/types/directorRuntime";
import { DirectorPolicyEngine, type DirectorPolicyRequest } from "./DirectorPolicyEngine";
import { DirectorRuntimeStore } from "./DirectorRuntimeStore";

export interface DirectorNodeContract<TInput, TOutput> {
  nodeKey: string;
  label: string;
  reads: string[];
  writes: string[];
  policyAction?: DirectorPolicyRequest["action"];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  run(input: TInput): Promise<TOutput>;
}

export interface DirectorNodeRunInput<TInput> {
  taskId?: string | null;
  novelId?: string | null;
  targetType?: DirectorStepRun["targetType"];
  targetId?: string | null;
  input: TInput;
  policy?: Omit<Partial<DirectorPolicyRequest>, "action">;
}

export interface DirectorNodeRunResult<TOutput> {
  status: "completed" | "needs_approval" | "blocked_scope" | "failed";
  output?: TOutput;
  runtimeSnapshot?: DirectorRuntimeSnapshot | null;
  producedArtifacts: DirectorArtifactRef[];
  reason?: string;
}

export class DirectorNodeRunner {
  constructor(
    private readonly runtimeStore = new DirectorRuntimeStore(),
    private readonly policyEngine = new DirectorPolicyEngine(),
  ) {}

  async run<TInput, TOutput>(
    contract: DirectorNodeContract<TInput, TOutput>,
    input: DirectorNodeRunInput<TInput>,
    collectArtifacts?: (output: TOutput) => DirectorArtifactRef[],
  ): Promise<DirectorNodeRunResult<TOutput>> {
    const snapshot = input.taskId?.trim()
      ? await this.runtimeStore.getSnapshot(input.taskId.trim())
      : null;
    const policyDecision = this.policyEngine.decide({
      mayOverwriteUserContent: contract.mayModifyUserContent,
      requiresApprovalByDefault: contract.requiresApprovalByDefault,
      ...input.policy,
      action: contract.policyAction ?? "run_node",
      policy: input.policy?.policy ?? snapshot?.policy ?? null,
    });
    if (!policyDecision.canRun || policyDecision.requiresApproval) {
      let runtimeSnapshot: DirectorRuntimeSnapshot | null = snapshot;
      if (input.taskId?.trim()) {
        await this.runtimeStore.recordNodeGate({
          taskId: input.taskId.trim(),
          novelId: input.novelId,
          nodeKey: contract.nodeKey,
          label: contract.label,
          targetType: input.targetType,
          targetId: input.targetId,
          status: policyDecision.canRun ? "waiting_approval" : "blocked_scope",
          decision: policyDecision,
        });
        runtimeSnapshot = await this.runtimeStore.getSnapshot(input.taskId.trim());
      }
      return {
        status: policyDecision.canRun ? "needs_approval" : "blocked_scope",
        runtimeSnapshot,
        producedArtifacts: [],
        reason: policyDecision.reason,
      };
    }

    if (input.taskId?.trim()) {
      await this.runtimeStore.recordStepStarted({
        taskId: input.taskId.trim(),
        novelId: input.novelId,
        nodeKey: contract.nodeKey,
        label: contract.label,
        targetType: input.targetType,
        targetId: input.targetId,
      });
    }

    try {
      const output = await contract.run(input.input);
      const producedArtifacts = collectArtifacts?.(output) ?? [];
      let runtimeSnapshot: DirectorRuntimeSnapshot | null = null;
      if (input.taskId?.trim()) {
        await this.runtimeStore.recordStepCompleted({
          taskId: input.taskId.trim(),
          novelId: input.novelId,
          nodeKey: contract.nodeKey,
          label: contract.label,
          targetType: input.targetType,
          targetId: input.targetId,
          producedArtifacts,
        });
        runtimeSnapshot = await this.runtimeStore.getSnapshot(input.taskId.trim());
      }
      return {
        status: "completed",
        output,
        runtimeSnapshot,
        producedArtifacts,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (input.taskId?.trim()) {
        await this.runtimeStore.recordStepFailed({
          taskId: input.taskId.trim(),
          novelId: input.novelId,
          nodeKey: contract.nodeKey,
          label: contract.label,
          targetType: input.targetType,
          targetId: input.targetId,
          error: message,
        });
      }
      throw error;
    }
  }
}
