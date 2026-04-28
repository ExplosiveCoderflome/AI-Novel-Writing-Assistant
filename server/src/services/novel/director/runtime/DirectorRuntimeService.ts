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
import {
  DirectorLangGraphPilot,
  type DirectorLangGraphPilotCheckpoint,
  type DirectorLangGraphPilotInput,
  type DirectorLangGraphPilotResult,
} from "../langgraphPilot/DirectorLangGraphPilot";
import type { WorkflowPlan, WorkflowPlanStep } from "../workflowStepRuntime/WorkflowStepModule";

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

export interface DirectorRuntimeWorkflowStepExecutorInput {
  taskId: string;
  novelId?: string | null;
  plan: WorkflowPlan;
  step: WorkflowPlanStep;
}

export type DirectorRuntimeWorkflowStepExecutor = (
  input: DirectorRuntimeWorkflowStepExecutorInput,
) => Promise<void>;

export interface DirectorRuntimeWorkflowInput {
  taskId: string;
  novelId?: string | null;
  plan: WorkflowPlan;
  checkpoint?: DirectorLangGraphPilotCheckpoint | null;
  interruptBeforeStepIds?: string[];
  resume?: DirectorLangGraphPilotInput["resume"];
  runStep: DirectorRuntimeWorkflowStepExecutor;
}

export interface DirectorRuntimeUntilGateResult {
  status: DirectorLangGraphPilotResult["status"];
  executedStepIds: string[];
  interrupt: DirectorLangGraphPilotResult["interrupt"];
  checkpoint: DirectorLangGraphPilotCheckpoint;
  trace: DirectorLangGraphPilotResult["trace"];
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

  getRuntimeSnapshot(taskId: string): Promise<DirectorRuntimeSnapshot | null> {
    return this.getSnapshot(taskId);
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

  recordRunResumed(input: {
    taskId: string;
    novelId?: string | null;
    summary?: string;
    reason?: string | null;
  }): Promise<void> {
    return this.store.recordRunResumed(input);
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

  runNextStep(input: DirectorRuntimeWorkflowInput): Promise<DirectorLangGraphPilotResult> {
    const pilot = new DirectorLangGraphPilot({
      directorRuntime: this,
      runStep: input.runStep,
    });
    return pilot.run({
      taskId: input.taskId,
      novelId: input.novelId,
      plan: input.plan,
      checkpoint: input.checkpoint,
      interruptBeforeStepIds: input.interruptBeforeStepIds,
      resume: input.resume,
    });
  }

  continueRuntime(input: DirectorRuntimeWorkflowInput & {
    until?: "next_step" | "gate";
  }): Promise<DirectorLangGraphPilotResult | DirectorRuntimeUntilGateResult> {
    return input.until === "gate"
      ? this.runUntilGate(input)
      : this.runNextStep(input);
  }

  async runUntilGate(input: DirectorRuntimeWorkflowInput): Promise<DirectorRuntimeUntilGateResult> {
    let checkpoint = input.checkpoint ?? null;
    let resume = input.resume ?? null;
    const executedStepIds: string[] = [];
    let trace: DirectorLangGraphPilotResult["trace"] = [];
    let lastResult: DirectorLangGraphPilotResult | null = null;
    const maxIterations = Math.max(input.plan.steps.length, 1);

    for (let index = 0; index < maxIterations; index += 1) {
      const result = await this.runNextStep({
        ...input,
        checkpoint,
        resume,
      });
      lastResult = result;
      executedStepIds.push(...result.executedStepIds);
      trace = result.trace;
      checkpoint = result.checkpoint;
      resume = null;
      if (result.status === "interrupted" || result.status === "failed") {
        return {
          status: result.status,
          executedStepIds: [...new Set(executedStepIds)],
          interrupt: result.interrupt,
          checkpoint: result.checkpoint,
          trace,
        };
      }
      const completedStepIds = new Set(result.checkpoint.completedStepIds);
      if (input.plan.steps.every((step) => completedStepIds.has(step.stepId))) {
        break;
      }
      checkpoint = {
        completedGraphNodes: [],
        completedStepIds: result.checkpoint.completedStepIds,
        pendingStep: null,
        interrupt: null,
        trace: result.checkpoint.trace,
      };
    }

    return {
      status: lastResult?.status ?? "completed",
      executedStepIds: [...new Set(executedStepIds)],
      interrupt: lastResult?.interrupt ?? null,
      checkpoint: checkpoint ?? {
        completedGraphNodes: [],
        completedStepIds: [],
        pendingStep: null,
        interrupt: null,
        trace: [],
      },
      trace,
    };
  }
}
