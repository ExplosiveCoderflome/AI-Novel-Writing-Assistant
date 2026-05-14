import {
  DIRECTOR_CANDIDATE_NODE_ADAPTERS,
  type DirectorCandidateStageNode,
} from "../novelDirectorCandidateNodeAdapters";
import { getDirectorConfirmNovelCreateNodeAdapter } from "../novelDirectorConfirmNodeAdapters";
import { getDirectorTakeoverNodeAdapter } from "../novelDirectorTakeoverNodeAdapters";
import {
  createWorkflowStepDescriptorFromDirectorAdapter,
  createWorkflowStepModule,
  type WorkflowStepModule,
  type WorkflowStepModuleDescriptor,
} from "./WorkflowStepModule";
import {
  blockedState,
  buildSimpleProgress,
  completedFact,
  isCandidateStageFactCompleted,
  loadDirectorModuleState,
  loadFactBaseSummary,
  pendingFact,
  readyState,
} from "./directorWorkflowStepShared";
import {
  DIRECTOR_CANDIDATE_STEP_IDS,
  DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID,
  DIRECTOR_TAKEOVER_STEP_ID,
} from "./directorWorkflowStepIds";

async function externalRunnerOnlyExecute(): Promise<void> {
  throw new Error("Workflow step module requires an explicit runner.");
}

function createCandidateExecutableModule(
  stage: DirectorCandidateStageNode,
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<Record<string, never>, void> {
  return createWorkflowStepModule(
    descriptor,
    externalRunnerOnlyExecute,
    {
      inspectReadiness: async (context) => {
        const { state } = await loadDirectorModuleState(context, { requireNovel: false, requireRequest: false });
        const summary = await loadFactBaseSummary(context);
        return summary.candidate.candidateCount > 0 || state.seedPayload.idea
          ? readyState({
            evidence: {
              batchCount: summary.candidate.batchCount,
              candidateCount: summary.candidate.candidateCount,
              mode: summary.candidate.mode,
            },
          })
          : blockedState("Candidate generation requires a persisted idea seed.", {
            code: "missing_candidate_seed",
          });
      },
      inspectCompletion: async (context) => {
        const summary = await loadFactBaseSummary(context);
        const completed = isCandidateStageFactCompleted({
          stage,
          batchCount: summary.candidate.batchCount,
          mode: summary.candidate.mode,
          hasNovelProject: summary.hasNovelProject,
        });
        return completed
          ? completedFact(descriptor.id, {
            evidence: {
              batchCount: summary.candidate.batchCount,
              candidateCount: summary.candidate.candidateCount,
              mode: summary.candidate.mode,
              hasNovelProject: summary.hasNovelProject,
            },
          })
          : pendingFact(descriptor.id, {
            ratio: stage === "candidate_generation" && summary.candidate.batchCount > 0 ? 1 : 0,
            evidence: {
              batchCount: summary.candidate.batchCount,
              candidateCount: summary.candidate.candidateCount,
              mode: summary.candidate.mode,
              hasNovelProject: summary.hasNovelProject,
            },
          });
      },
      buildInput: async () => ({}),
      validateOutput: async (_output, context) => {
        const summary = await loadFactBaseSummary(context);
        return {
          valid: isCandidateStageFactCompleted({
            stage,
            batchCount: summary.candidate.batchCount,
            mode: summary.candidate.mode,
            hasNovelProject: summary.hasNovelProject,
          }),
          reason: "Candidate stage facts are not complete yet.",
        };
      },
      inspectProgress: async (context) => {
        const summary = await loadFactBaseSummary(context);
        const completed = isCandidateStageFactCompleted({
          stage,
          batchCount: summary.candidate.batchCount,
          mode: summary.candidate.mode,
          hasNovelProject: summary.hasNovelProject,
        });
        return buildSimpleProgress({
          status: completed ? "completed" : summary.candidate.batchCount > 0 ? "partially_done" : "not_started",
          ratio: completed ? 1 : summary.candidate.batchCount > 0 ? 0.5 : 0,
          label: completed && summary.hasNovelProject && stage !== "candidate_generation"
            ? "小说已建立，候选方向修订阶段已封存"
            : descriptor.label,
          evidence: {
            batchCount: summary.candidate.batchCount,
            candidateCount: summary.candidate.candidateCount,
            mode: summary.candidate.mode,
            hasNovelProject: summary.hasNovelProject,
          },
          nextAction: completed ? null : "continue",
        });
      },
      recover: async () => ({
        recoverable: true,
        resumeFrom: descriptor.id,
        reason: "Candidate selection can resume from persisted candidate facts.",
      }),
      completeCriteria: async (_output, context) => {
        const summary = await loadFactBaseSummary(context);
        return isCandidateStageFactCompleted({
          stage,
          batchCount: summary.candidate.batchCount,
          mode: summary.candidate.mode,
          hasNovelProject: summary.hasNovelProject,
        });
      },
    },
  );
}

function createConfirmNovelCreateExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<Record<string, never>, void> {
  return createWorkflowStepModule(
    descriptor,
    externalRunnerOnlyExecute,
    {
      inspectReadiness: async (context) => {
        const summary = await loadFactBaseSummary(context);
        return summary.hasNovelProject || summary.candidate.batchCount > 0
          ? readyState({
            evidence: {
              batchCount: summary.candidate.batchCount,
              hasNovelProject: summary.hasNovelProject,
            },
          })
          : blockedState("Candidate confirmation requires at least one candidate batch.", {
            code: "missing_candidate_batch",
          });
      },
      inspectCompletion: async (context) => {
        const summary = await loadFactBaseSummary(context);
        return summary.hasNovelProject
          ? completedFact(descriptor.id, { evidence: { hasNovelProject: true } })
          : pendingFact(descriptor.id, { evidence: { hasNovelProject: false, batchCount: summary.candidate.batchCount } });
      },
      buildInput: async () => ({}),
      validateOutput: async (_output, context) => ({
        valid: (await loadFactBaseSummary(context)).hasNovelProject,
        reason: "Novel project was not materialized.",
      }),
      inspectProgress: async (context) => {
        const summary = await loadFactBaseSummary(context);
        return buildSimpleProgress({
          status: summary.hasNovelProject ? "completed" : "partially_done",
          ratio: summary.hasNovelProject ? 1 : summary.candidate.batchCount > 0 ? 0.5 : 0,
          label: descriptor.label,
          evidence: { hasNovelProject: summary.hasNovelProject, batchCount: summary.candidate.batchCount },
          nextAction: summary.hasNovelProject ? "run_story_macro" : "continue",
        });
      },
      recover: async () => ({
        recoverable: true,
        resumeFrom: descriptor.id,
        reason: "Novel creation can resume from persisted confirmation facts.",
      }),
      completeCriteria: async (_output, context) => (await loadFactBaseSummary(context)).hasNovelProject,
    },
  );
}

function createTakeoverExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<Record<string, never>, void> {
  return createWorkflowStepModule(
    descriptor,
    externalRunnerOnlyExecute,
    {
      inspectReadiness: async (context) => {
        const { state } = await loadDirectorModuleState(context, { requireRequest: false });
        return state.task.novelId?.trim()
          ? readyState({ evidence: { novelId: state.task.novelId } })
          : blockedState("Takeover requires a bound novel project.", {
            code: "missing_takeover_novel",
          });
      },
      inspectCompletion: async (context) => {
        const { state } = await loadDirectorModuleState(context, { requireRequest: false });
        const completed = Boolean(state.task.novelId?.trim() && state.run?.id);
        return completed
          ? completedFact(descriptor.id, { evidence: { novelId: state.task.novelId, runtimeId: state.run?.id ?? null } })
          : pendingFact(descriptor.id, { evidence: { novelId: state.task.novelId ?? null, runtimeId: state.run?.id ?? null } });
      },
      buildInput: async () => ({}),
      validateOutput: async (_output, context) => {
        const { state } = await loadDirectorModuleState(context, { requireRequest: false });
        return {
          valid: Boolean(state.task.novelId?.trim() && state.run?.id),
          reason: "Takeover runtime facts were not materialized.",
        };
      },
      inspectProgress: async (context) => {
        const { state } = await loadDirectorModuleState(context, { requireRequest: false });
        const completed = Boolean(state.task.novelId?.trim() && state.run?.id);
        return buildSimpleProgress({
          status: completed ? "completed" : "partially_done",
          ratio: completed ? 1 : state.task.novelId?.trim() ? 0.5 : 0,
          label: descriptor.label,
          evidence: { novelId: state.task.novelId ?? null, runtimeId: state.run?.id ?? null },
          nextAction: completed ? "continue" : null,
        });
      },
      recover: async () => ({
        recoverable: true,
        resumeFrom: descriptor.id,
        reason: "Takeover can resume from persisted runtime facts.",
      }),
      completeCriteria: async (_output, context) => {
        const { state } = await loadDirectorModuleState(context, { requireRequest: false });
        return Boolean(state.task.novelId?.trim() && state.run?.id);
      },
    },
  );
}

export const DIRECTOR_CANDIDATE_STEP_MODULES: Record<
  DirectorCandidateStageNode,
  WorkflowStepModuleDescriptor
> = Object.fromEntries(
  Object.entries(DIRECTOR_CANDIDATE_NODE_ADAPTERS).map(([stage, adapter]) => [
    stage,
    createCandidateExecutableModule(
      stage as DirectorCandidateStageNode,
      createWorkflowStepDescriptorFromDirectorAdapter({
        id: DIRECTOR_CANDIDATE_STEP_IDS[stage as DirectorCandidateStageNode],
        stage: "candidate_selection",
        adapter,
      }),
    ),
  ]),
) as unknown as Record<DirectorCandidateStageNode, WorkflowStepModuleDescriptor>;

export const DIRECTOR_TAKEOVER_STEP_MODULE = createTakeoverExecutableModule(
  createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_TAKEOVER_STEP_ID,
    stage: "takeover",
    adapter: getDirectorTakeoverNodeAdapter(),
  }),
);

export const DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE = createConfirmNovelCreateExecutableModule(
  createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID,
    stage: "candidate_confirm",
    adapter: getDirectorConfirmNovelCreateNodeAdapter(),
  }),
);
