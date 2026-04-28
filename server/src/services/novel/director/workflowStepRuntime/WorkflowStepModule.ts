import type {
  DirectorArtifactRef,
  DirectorPolicyMode,
} from "@ai-novel/shared/types/directorRuntime";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";
import type {
  PromptAsset,
  PromptContextRequirement,
} from "../../../../prompting/core/promptTypes";
import type { DirectorPolicyRequest } from "../runtime/DirectorPolicyEngine";
import type { DirectorNodeContract } from "../runtime/DirectorNodeRunner";

export type WorkflowStepApprovalRequirement = "never" | "risky" | "always";

export interface WorkflowStepPromptAssetRef {
  id: PromptAsset<unknown, unknown, unknown>["id"];
  version: PromptAsset<unknown, unknown, unknown>["version"];
}

export interface WorkflowStepWaitingState {
  stage: NovelWorkflowStage;
  itemKey?: string | null;
  itemLabel?: string | null;
  progress?: number;
}

export interface WorkflowStepExecutionContext {
  taskId?: string | null;
  novelId?: string | null;
  targetType?: DirectorArtifactRef["targetType"] | null;
  targetId?: string | null;
  policyMode?: DirectorPolicyMode | null;
}

export type WorkflowStepGateResult =
  | { status: "ready" }
  | { status: "needs_approval"; reason: string }
  | { status: "blocked"; reason: string };

export interface WorkflowStepSummary {
  title: string;
  detail?: string;
  producedArtifacts?: DirectorArtifactRef[];
}

export interface WorkflowStepModuleDescriptor {
  id: string;
  nodeKey: string;
  label: string;
  stage: string;
  targetType: DirectorArtifactRef["targetType"];
  reads: string[];
  writes: string[];
  policyAction?: DirectorPolicyRequest["action"];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  inputSchema?: unknown;
  outputSchema?: unknown;
  contextRequirements?: PromptContextRequirement[];
  promptAssets?: WorkflowStepPromptAssetRef[];
  defaultWaitingState?: WorkflowStepWaitingState;
}

export interface WorkflowStepModule<I, O> extends WorkflowStepModuleDescriptor {
  validatePreconditions?: (
    input: I,
    context: WorkflowStepExecutionContext,
  ) => Promise<WorkflowStepGateResult>;
  execute: (input: I, context: WorkflowStepExecutionContext) => Promise<O>;
  summarizeResult?: (output: O) => WorkflowStepSummary;
  getApprovalRequirement?: (
    input: I,
    output?: O,
  ) => WorkflowStepApprovalRequirement;
}

export interface WorkflowStepDependency {
  stepId: string;
  dependsOn: string[];
}

export interface WorkflowPlanStep {
  id: string;
  stepId: string;
  nodeKey: string;
  label: string;
  stage: string;
  targetType: DirectorArtifactRef["targetType"];
  reads: string[];
  writes: string[];
  dependsOn: string[];
  approvalRequirement: WorkflowStepApprovalRequirement;
  input?: Record<string, unknown>;
}

export interface WorkflowPlan {
  id: string;
  goal: string;
  source: "auto_director" | "chapter_pipeline" | "creative_hub" | "manual";
  policy: {
    mode?: DirectorPolicyMode;
    approvalRequirement: WorkflowStepApprovalRequirement;
  };
  steps: WorkflowPlanStep[];
  dependencies: WorkflowStepDependency[];
  approvalRequirement: WorkflowStepApprovalRequirement;
}

export interface LegacyDirectorNodeAdapterLike {
  nodeKey: string;
  label: string;
  targetType: DirectorArtifactRef["targetType"];
  reads: string[];
  writes: string[];
  policyAction?: DirectorPolicyRequest["action"];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  waitingState?: WorkflowStepWaitingState;
}

export function createWorkflowStepDescriptorFromDirectorAdapter(input: {
  id: string;
  stage: string;
  adapter: LegacyDirectorNodeAdapterLike;
  contextRequirements?: PromptContextRequirement[];
  promptAssets?: WorkflowStepPromptAssetRef[];
}): WorkflowStepModuleDescriptor {
  return {
    id: input.id,
    nodeKey: input.adapter.nodeKey,
    label: input.adapter.label,
    stage: input.stage,
    targetType: input.adapter.targetType,
    reads: [...input.adapter.reads],
    writes: [...input.adapter.writes],
    policyAction: input.adapter.policyAction,
    mayModifyUserContent: input.adapter.mayModifyUserContent,
    requiresApprovalByDefault: input.adapter.requiresApprovalByDefault,
    supportsAutoRetry: input.adapter.supportsAutoRetry,
    contextRequirements: input.contextRequirements,
    promptAssets: input.promptAssets,
    defaultWaitingState: input.adapter.waitingState,
  };
}

export function createWorkflowStepModule<I, O>(
  descriptor: WorkflowStepModuleDescriptor,
  execute: WorkflowStepModule<I, O>["execute"],
  options?: Pick<
    WorkflowStepModule<I, O>,
    "validatePreconditions" | "summarizeResult" | "getApprovalRequirement"
  >,
): WorkflowStepModule<I, O> {
  return {
    ...descriptor,
    execute,
    validatePreconditions: options?.validatePreconditions,
    summarizeResult: options?.summarizeResult,
    getApprovalRequirement: options?.getApprovalRequirement,
  };
}

export function workflowStepModuleToDirectorNodeContract<I, O>(
  module: WorkflowStepModule<I, O>,
  context: WorkflowStepExecutionContext = {},
): DirectorNodeContract<I, O> {
  return {
    nodeKey: module.nodeKey,
    label: module.label,
    reads: module.reads,
    writes: module.writes,
    policyAction: module.policyAction,
    mayModifyUserContent: module.mayModifyUserContent,
    requiresApprovalByDefault: module.requiresApprovalByDefault,
    supportsAutoRetry: module.supportsAutoRetry,
    run: (input) => module.execute(input, context),
  };
}

export function createWorkflowPlanFromStepModules(input: {
  id: string;
  goal: string;
  source: WorkflowPlan["source"];
  modules: readonly WorkflowStepModuleDescriptor[];
  mode?: DirectorPolicyMode;
  approvalRequirement?: WorkflowStepApprovalRequirement;
  stepInputs?: Record<string, Record<string, unknown>>;
}): WorkflowPlan {
  const approvalRequirement = input.approvalRequirement ?? "risky";
  const steps = input.modules.map((module, index): WorkflowPlanStep => {
    const dependsOn = index === 0 ? [] : [input.modules[index - 1].id];
    return {
      id: `${input.id}.${index + 1}`,
      stepId: module.id,
      nodeKey: module.nodeKey,
      label: module.label,
      stage: module.stage,
      targetType: module.targetType,
      reads: [...module.reads],
      writes: [...module.writes],
      dependsOn,
      approvalRequirement: module.requiresApprovalByDefault ? "always" : approvalRequirement,
      input: input.stepInputs?.[module.id],
    };
  });
  return {
    id: input.id,
    goal: input.goal,
    source: input.source,
    policy: {
      mode: input.mode,
      approvalRequirement,
    },
    steps,
    dependencies: steps.map((step) => ({
      stepId: step.stepId,
      dependsOn: [...step.dependsOn],
    })),
    approvalRequirement,
  };
}
