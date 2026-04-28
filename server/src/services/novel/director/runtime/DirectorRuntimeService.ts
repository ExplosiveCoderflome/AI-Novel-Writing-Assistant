import type {
  DirectorArtifactRef,
  DirectorPolicyMode,
  DirectorRuntimePolicySnapshot,
  DirectorRuntimeSnapshot,
  DirectorStepRun,
  DirectorManualEditImpact,
  DirectorWorkspaceAnalysis,
} from "@ai-novel/shared/types/directorRuntime";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import { DirectorNodeRunner, type DirectorNodeContract, type DirectorNodeRunResult } from "./DirectorNodeRunner";
import { DirectorPolicyEngine, type DirectorPolicyRequest } from "./DirectorPolicyEngine";
import { DirectorRuntimeStore } from "./DirectorRuntimeStore";
import { DirectorWorkspaceAnalyzer } from "./DirectorWorkspaceAnalyzer";

export interface DirectorRuntimeInitializeInput {
  taskId: string;
  novelId?: string | null;
  entrypoint: string;
  policyMode?: DirectorPolicyMode;
  summary?: string;
}

export interface DirectorRuntimeWorkspaceAnalysisInput {
  novelId: string;
  workflowTaskId?: string | null;
  includeAiInterpretation?: boolean;
  llm?: DirectorLLMOptions;
}

export interface DirectorRuntimePolicyUpdateInput {
  taskId: string;
  mode: DirectorPolicyMode;
  patch?: Partial<Omit<DirectorRuntimePolicySnapshot, "mode" | "updatedAt">>;
}

export interface DirectorRuntimeStepInput {
  taskId: string;
  novelId?: string | null;
  nodeKey: string;
  label: string;
  targetType?: DirectorStepRun["targetType"];
  targetId?: string | null;
}

export class DirectorRuntimeService {
  private readonly store: DirectorRuntimeStore;
  private readonly analyzer: DirectorWorkspaceAnalyzer;
  private readonly nodeRunner: DirectorNodeRunner;

  constructor(input?: {
    store?: DirectorRuntimeStore;
    analyzer?: DirectorWorkspaceAnalyzer;
    policyEngine?: DirectorPolicyEngine;
  }) {
    this.store = input?.store ?? new DirectorRuntimeStore();
    this.analyzer = input?.analyzer ?? new DirectorWorkspaceAnalyzer(this.store);
    this.nodeRunner = new DirectorNodeRunner(
      this.store,
      input?.policyEngine ?? new DirectorPolicyEngine(),
    );
  }

  initializeRun(input: DirectorRuntimeInitializeInput): Promise<DirectorRuntimeSnapshot | null> {
    return this.store.initializeRun(input);
  }

  getSnapshot(taskId: string): Promise<DirectorRuntimeSnapshot | null> {
    return this.store.getSnapshot(taskId);
  }

  analyzeWorkspace(input: DirectorRuntimeWorkspaceAnalysisInput): Promise<DirectorWorkspaceAnalysis> {
    return this.analyzer.analyze(input);
  }

  evaluateManualEditImpact(input: DirectorRuntimeWorkspaceAnalysisInput & {
    chapterId?: string | null;
  }): Promise<DirectorManualEditImpact> {
    return this.analyzer.evaluateManualEditImpact(input);
  }

  recordWorkspaceAnalysis(input: {
    taskId: string;
    analysis: DirectorWorkspaceAnalysis;
  }): Promise<void> {
    return this.store.recordWorkspaceAnalysis(input);
  }

  updatePolicy(input: DirectorRuntimePolicyUpdateInput): Promise<DirectorRuntimeSnapshot | null> {
    return this.store.updatePolicy(input);
  }

  recordStepStarted(input: DirectorRuntimeStepInput): Promise<void> {
    return this.store.recordStepStarted(input);
  }

  recordStepCompleted(input: DirectorRuntimeStepInput & {
    producedArtifacts?: DirectorArtifactRef[];
  }): Promise<void> {
    return this.store.recordStepCompleted(input);
  }

  recordStepFailed(input: DirectorRuntimeStepInput & {
    error: string;
  }): Promise<void> {
    return this.store.recordStepFailed(input);
  }

  async runNode<TInput, TOutput>(
    contract: DirectorNodeContract<TInput, TOutput>,
    input: {
      taskId?: string | null;
      novelId?: string | null;
      targetType?: DirectorStepRun["targetType"];
      targetId?: string | null;
      payload: TInput;
      policy?: Omit<Partial<DirectorPolicyRequest>, "action">;
    },
    collectArtifacts?: (output: TOutput) => DirectorArtifactRef[],
  ): Promise<DirectorNodeRunResult<TOutput>> {
    return this.nodeRunner.run(
      contract,
      {
        taskId: input.taskId,
        novelId: input.novelId,
        targetType: input.targetType,
        targetId: input.targetId,
        input: input.payload,
        policy: input.policy,
      },
      collectArtifacts,
    );
  }
}
