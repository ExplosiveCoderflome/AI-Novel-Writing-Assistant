import type {
  DirectorArtifactRef,
  DirectorRecoveryCursor,
  DirectorStepBlocker,
  DirectorStepCompletionEvidence,
  DirectorStepFactInspection,
  DirectorPolicyMode,
} from "@ai-novel/shared/types/directorRuntime";
import {
  findWorkflowStepCatalogEntryById,
  type WorkflowStepCatalogEntry,
} from "@ai-novel/shared/types/directorWorkflowStepCatalog";
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
  runId?: string | null;
  commandId?: string | null;
  targetType?: DirectorArtifactRef["targetType"] | null;
  targetId?: string | null;
  policyMode?: DirectorPolicyMode | null;
  artifacts?: DirectorArtifactRef[];
  projectionHints?: Record<string, unknown>;
}

export type WorkflowStepProgressStatus =
  | "not_started"
  | "blocked"
  | "running"
  | "partially_done"
  | "completed"
  | "failed"
  | "needs_review";

export interface WorkflowStepProgress {
  status: WorkflowStepProgressStatus;
  current: number;
  total: number;
  ratio: number;
  label: string;
  evidence?: Record<string, unknown>;
  nextAction?: string | null;
}

export interface WorkflowStepReadiness {
  ready: boolean;
  blockers: DirectorStepBlocker[];
  evidence?: Record<string, unknown>;
  resumeFrom?: string | null;
}

export interface WorkflowStepValidation {
  valid: boolean;
  reason?: string;
  evidence?: Record<string, unknown>;
}

export interface WorkflowStepCommitResult {
  producedArtifacts?: DirectorArtifactRef[];
  summary?: string;
}

export interface WorkflowStepRecoveryPlan {
  recoverable: boolean;
  resumeFrom?: string | null;
  reason?: string;
  cursor?: DirectorRecoveryCursor | null;
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

export interface WorkflowStepFactSnapshot {
  readiness: WorkflowStepReadiness;
  completion: DirectorStepCompletionEvidence;
  progress: WorkflowStepProgress;
  recovery?: WorkflowStepRecoveryPlan | null;
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
  inspectReadiness: (context: WorkflowStepExecutionContext) => Promise<WorkflowStepReadiness>;
  inspectCompletion: (context: WorkflowStepExecutionContext) => Promise<DirectorStepCompletionEvidence>;
  buildInput: (context: WorkflowStepExecutionContext) => Promise<I>;
  validatePreconditions?: (
    input: I,
    context: WorkflowStepExecutionContext,
  ) => Promise<WorkflowStepGateResult>;
  execute: (input: I, context: WorkflowStepExecutionContext) => Promise<O>;
  validateOutput?: (
    output: O,
    context: WorkflowStepExecutionContext,
  ) => Promise<WorkflowStepValidation>;
  commit?: (
    output: O,
    context: WorkflowStepExecutionContext,
  ) => Promise<WorkflowStepCommitResult>;
  inspectProgress: (context: WorkflowStepExecutionContext) => Promise<WorkflowStepProgress>;
  recover: (context: WorkflowStepExecutionContext) => Promise<WorkflowStepRecoveryPlan>;
  completeCriteria?: (output: O, context: WorkflowStepExecutionContext) => boolean | Promise<boolean>;
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

export function createWorkflowStepDescriptorFromCatalogEntry(input: {
  entry: WorkflowStepCatalogEntry;
  defaultWaitingState?: WorkflowStepWaitingState;
  contextRequirements?: PromptContextRequirement[];
  promptAssets?: WorkflowStepPromptAssetRef[];
}): WorkflowStepModuleDescriptor {
  return {
    id: input.entry.id,
    nodeKey: input.entry.nodeKey,
    label: input.entry.label,
    stage: input.entry.stage,
    targetType: input.entry.targetType,
    reads: [...input.entry.reads],
    writes: [...input.entry.writes],
    policyAction: input.entry.policyAction as DirectorPolicyRequest["action"] | undefined,
    mayModifyUserContent: input.entry.mayModifyUserContent,
    requiresApprovalByDefault: input.entry.requiresApprovalByDefault,
    supportsAutoRetry: input.entry.supportsAutoRetry,
    contextRequirements: input.contextRequirements,
    promptAssets: input.promptAssets,
    defaultWaitingState: input.defaultWaitingState,
  };
}

export function createWorkflowStepDescriptorFromDirectorAdapter(input: {
  id: string;
  stage: string;
  adapter: LegacyDirectorNodeAdapterLike;
  contextRequirements?: PromptContextRequirement[];
  promptAssets?: WorkflowStepPromptAssetRef[];
}): WorkflowStepModuleDescriptor {
  const catalogEntry = findWorkflowStepCatalogEntryById(input.id);
  if (catalogEntry) {
    return createWorkflowStepDescriptorFromCatalogEntry({
      entry: catalogEntry,
      defaultWaitingState: input.adapter.waitingState,
      contextRequirements: input.contextRequirements,
      promptAssets: input.promptAssets,
    });
  }
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
  options: Pick<
    WorkflowStepModule<I, O>,
    | "inspectReadiness"
    | "inspectCompletion"
    | "buildInput"
    | "validatePreconditions"
    | "validateOutput"
    | "commit"
    | "inspectProgress"
    | "recover"
    | "completeCriteria"
    | "summarizeResult"
    | "getApprovalRequirement"
  >,
): WorkflowStepModule<I, O> {
  return {
    ...descriptor,
    execute,
    inspectReadiness: options.inspectReadiness,
    inspectCompletion: options.inspectCompletion,
    buildInput: options.buildInput,
    validatePreconditions: options?.validatePreconditions,
    validateOutput: options?.validateOutput,
    commit: options?.commit,
    inspectProgress: options.inspectProgress,
    recover: options.recover,
    completeCriteria: options?.completeCriteria,
    summarizeResult: options?.summarizeResult,
    getApprovalRequirement: options?.getApprovalRequirement,
  };
}

export function isExecutableWorkflowStepModule(
  module: WorkflowStepModuleDescriptor,
): module is WorkflowStepModule<unknown, unknown> {
  const candidate = module as Partial<WorkflowStepModule<unknown, unknown>>;
  return typeof candidate.execute === "function"
    && typeof candidate.inspectReadiness === "function"
    && typeof candidate.inspectCompletion === "function"
    && typeof candidate.buildInput === "function"
    && typeof candidate.inspectProgress === "function"
    && typeof candidate.recover === "function";
}

export async function inspectWorkflowStepFacts<I, O>(
  module: WorkflowStepModule<I, O>,
  context: WorkflowStepExecutionContext,
): Promise<DirectorStepFactInspection> {
  const [readiness, completion, progress, recovery] = await Promise.all([
    module.inspectReadiness(context),
    module.inspectCompletion(context),
    module.inspectProgress(context),
    module.recover(context),
  ]);
  return {
    stepId: module.id,
    ready: readiness.ready,
    completed: completion.completed,
    blockers: readiness.blockers,
    evidence: completion.evidence ?? readiness.evidence ?? progress.evidence,
    producedArtifacts: completion.producedArtifacts,
    completenessRatio: completion.completenessRatio,
    nextAction: progress.nextAction ?? readiness.blockers[0]?.nextAction ?? null,
    resumeFrom: recovery.resumeFrom ?? readiness.resumeFrom ?? null,
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
