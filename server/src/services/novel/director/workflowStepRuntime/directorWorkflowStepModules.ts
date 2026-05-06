import {
  DIRECTOR_CANDIDATE_NODE_ADAPTERS,
  type DirectorCandidateStageNode,
} from "../novelDirectorCandidateNodeAdapters";
import { getDirectorConfirmNovelCreateNodeAdapter } from "../novelDirectorConfirmNodeAdapters";
import {
  getDirectorExecutionNodeAdapter,
  getDirectorExecutionNodeSequence,
  type DirectorExecutionFlow,
  type DirectorExecutionStage,
} from "../novelDirectorExecutionNodeAdapters";
import {
  getDirectorStageNodeAdapter,
  type DirectorPlanningStage,
} from "../novelDirectorStageNodeAdapters";
import { getDirectorTakeoverNodeAdapter } from "../novelDirectorTakeoverNodeAdapters";
import {
  createWorkflowStepDescriptorFromDirectorAdapter,
  createWorkflowStepModule,
  type WorkflowStepModuleDescriptor,
  type WorkflowStepExecutionContext,
  type WorkflowStepModule,
  type WorkflowStepProgress,
} from "./WorkflowStepModule";
import { WorkflowStepModuleRegistry } from "./WorkflowStepModuleRegistry";
import { DirectorCoreStepModuleRuntime } from "./DirectorCoreStepModuleRuntime";
import { DirectorStateReader } from "../DirectorStateReader";
import { DirectorStateCommitter } from "../DirectorStateCommitter";
import { getDirectorInputFromSeedPayload } from "../novelDirectorHelpers";
import {
  hasDirectorAutoExecutionChapterContract,
  hasDirectorSyncedChapterExecutionContext,
} from "../novelDirectorAutoExecution";
import type { DirectorAutoExecutionState, DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { isDirectorAutoExecutionRunMode } from "@ai-novel/shared/types/novelDirector";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { DirectorArtifactRef } from "@ai-novel/shared/types/directorRuntime";

export const DIRECTOR_CANDIDATE_STEP_IDS: Record<DirectorCandidateStageNode, string> = {
  candidate_generation: "book.candidate.generate",
  candidate_refine: "book.candidate.refine",
  candidate_patch: "book.candidate.patch",
  candidate_title_refine: "book.candidate.title_refine",
};

export const DIRECTOR_PLANNING_STEP_IDS: Record<DirectorPlanningStage, string> = {
  story_macro: "story.macro.plan",
  book_contract: "book.contract.create",
  character_setup: "character.cast.prepare",
  volume_strategy: "volume.strategy.plan",
  structured_outline: "volume.beat_sheet.generate",
};

export const DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS = {
  beat_sheet: "volume.beat_sheet.generate",
  chapter_list: "volume.chapter_list.generate",
  chapter_detail_bundle: "volume.chapter_detail_bundle.generate",
} as const;

export const DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_ID = "chapter.execution_contract.sync";

export const DIRECTOR_EXECUTION_STEP_IDS: Record<DirectorExecutionStage, string> = {
  chapter_execution: "chapter.draft.write",
  chapter_quality_review: "chapter.quality.review",
  chapter_repair: "chapter.draft.repair",
  chapter_state_commit: "chapter.state.commit",
  payoff_ledger_sync: "payoff.ledger.sync",
  character_resource_sync: "character.resource.sync",
  quality_repair: "chapter.quality.repair",
};

export const DIRECTOR_TAKEOVER_STEP_ID = "workflow.takeover.execute";
export const DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID = "book.project.create";

let directorCoreStepRuntime: DirectorCoreStepModuleRuntime | null = null;
let directorCoreStateReader: DirectorStateReader | null = null;
let directorCoreStateCommitter: DirectorStateCommitter | null = null;

function getDirectorCoreStepRuntime(): DirectorCoreStepModuleRuntime {
  if (!directorCoreStepRuntime) {
    directorCoreStepRuntime = new DirectorCoreStepModuleRuntime();
  }
  return directorCoreStepRuntime;
}

function getDirectorCoreStateReader(): DirectorStateReader {
  if (!directorCoreStateReader) {
    directorCoreStateReader = new DirectorStateReader();
  }
  return directorCoreStateReader;
}

function getDirectorCoreStateCommitter(): DirectorStateCommitter {
  if (!directorCoreStateCommitter) {
    directorCoreStateCommitter = new DirectorStateCommitter();
  }
  return directorCoreStateCommitter;
}

async function loadDirectorModuleState(context: WorkflowStepExecutionContext) {
  if (!context.taskId?.trim()) {
    throw new Error("Director step module requires task context.");
  }
  const state = await getDirectorCoreStateReader().readByTaskId(context.taskId.trim());
  if (!state) {
    throw new Error("Director workflow task not found.");
  }
  const novelId = context.novelId?.trim() || state.task.novelId?.trim() || "";
  if (!novelId) {
    throw new Error("Director step module requires a bound novel.");
  }
  const request = getDirectorInputFromSeedPayload(state.seedPayload);
  if (!request) {
    throw new Error("Director step module requires persisted director input.");
  }
  return {
    state,
    novelId,
    request,
  };
}

function buildSimpleProgress(input: {
  status: WorkflowStepProgress["status"];
  ratio: number;
  label: string;
  evidence?: Record<string, unknown>;
  nextAction?: string | null;
}): WorkflowStepProgress {
  const ratio = Math.max(0, Math.min(1, input.ratio));
  return {
    status: input.status,
    current: ratio,
    total: 1,
    ratio,
    label: input.label,
    evidence: input.evidence,
    nextAction: input.nextAction ?? null,
  };
}

function countMaterializedExecutionChapters(input: {
  plannedChapterOrders: number[];
  executionChapters: Array<{ order: number }>;
}): number {
  const executionChapterOrders = new Set(
    input.executionChapters
      .map((chapter) => chapter.order)
      .filter((order) => Number.isFinite(order)),
  );
  return input.plannedChapterOrders.filter((order) => executionChapterOrders.has(order)).length;
}

function completedFact(stepId: string, input?: {
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
}): {
  stepId: string;
  completed: boolean;
  completenessRatio: number;
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
} {
  return {
    stepId,
    completed: true,
    completenessRatio: 1,
    evidence: input?.evidence,
    producedArtifacts: input?.producedArtifacts,
  };
}

function pendingFact(stepId: string, input?: {
  ratio?: number;
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
}): {
  stepId: string;
  completed: boolean;
  completenessRatio: number;
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
} {
  return {
    stepId,
    completed: false,
    completenessRatio: Math.max(0, Math.min(1, input?.ratio ?? 0)),
    evidence: input?.evidence,
    producedArtifacts: input?.producedArtifacts,
  };
}

function readyState(input?: {
  evidence?: Record<string, unknown>;
  resumeFrom?: string | null;
}) {
  return {
    ready: true,
    blockers: [],
    evidence: input?.evidence,
    resumeFrom: input?.resumeFrom ?? null,
  };
}

function blockedState(reason: string, input?: {
  code?: string;
  evidence?: Record<string, unknown>;
  nextAction?: string | null;
  retryable?: boolean;
  resumeFrom?: string | null;
}) {
  return {
    ready: false,
    blockers: [{
      code: input?.code ?? "blocked",
      reason,
      retryable: input?.retryable ?? true,
      nextAction: input?.nextAction ?? null,
      evidence: input?.evidence,
    }],
    evidence: input?.evidence,
    resumeFrom: input?.resumeFrom ?? null,
  };
}

function createStoryMacroExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, StoryMacroPlan> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeStoryMacroStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return readyState({
          evidence: {
            artifactType: "story_macro",
            hasStoryMacro: Boolean(await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId)),
          },
        });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        return plan?.decomposition && typeof plan.storyInput === "string" && plan.storyInput.trim()
          ? completedFact(descriptor.id, { evidence: { artifactType: "story_macro" } })
          : pendingFact(descriptor.id, { evidence: { artifactType: "story_macro" } });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request,
        };
      },
      validateOutput: async (output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        return {
          valid: Boolean(output && plan?.decomposition),
          reason: output && plan?.decomposition ? undefined : "Story macro output was not persisted.",
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        return plan?.decomposition
          ? buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "故事宏观规划已完成",
            evidence: { artifactType: "story_macro" },
          })
          : buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "等待生成故事宏观规划",
            nextAction: "run_story_macro",
          });
      },
      recover: async (context) => {
        const progress = await getDirectorCoreStepRuntime().getStoryMacroPlan((await loadDirectorModuleState(context)).novelId);
        return progress?.decomposition
          ? { recoverable: true, resumeFrom: "story_macro_artifact", reason: "Story macro artifact already exists." }
          : { recoverable: true, resumeFrom: "story_macro", reason: "Story macro can be regenerated." };
      },
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        return Boolean(plan?.decomposition);
      },
    },
  );
}

function createBookContractExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, void> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeBookContractStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        if (!plan?.decomposition) {
          return blockedState("Story macro is required before book contract.", {
            code: "missing_story_macro",
            evidence: { artifactType: "story_macro" },
            nextAction: "run_story_macro",
          });
        }
        return readyState({ evidence: { artifactType: "book_contract", hasBookContract: Boolean(contract) } });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        return contract
          ? completedFact(descriptor.id, { evidence: { artifactType: "book_contract" } })
          : pendingFact(descriptor.id, { evidence: { artifactType: "book_contract" } });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request,
        };
      },
      validateOutput: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        return {
          valid: Boolean(contract),
          reason: contract ? undefined : "Book contract was not persisted.",
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        return contract
          ? buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "书级创作约定已完成",
            evidence: { artifactType: "book_contract" },
          })
          : buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "等待生成书级创作约定",
            nextAction: "run_book_contract",
          });
      },
      recover: async (context) => {
        const { novelId, state } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        if (contract) {
          await getDirectorCoreStateCommitter().recordRecoveryHint({
            taskId: state.task.id,
            novelId,
            runtimeId: state.runtime?.id ?? null,
            nodeKey: descriptor.nodeKey,
            reason: "Book contract artifact already exists and can be reused.",
            resumeFrom: "book_contract_artifact",
          });
          return { recoverable: true, resumeFrom: "book_contract_artifact", reason: "Book contract artifact already exists." };
        }
        return { recoverable: true, resumeFrom: "book_contract", reason: "Book contract can be regenerated." };
      },
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return Boolean(await getDirectorCoreStepRuntime().getBookContract(novelId));
      },
    },
  );
}

function createCharacterSetupExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, boolean> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeCharacterSetupStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        if (!plan?.decomposition || !contract) {
          return blockedState("Story macro and book contract are required before character setup.", {
            code: "missing_character_inputs",
            evidence: {
              hasStoryMacro: Boolean(plan?.decomposition),
              hasBookContract: Boolean(contract),
            },
            nextAction: "prepare_upstream_assets",
          });
        }
        return readyState({ evidence: { artifactType: "character_cast", characterCount } });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        return characterCount > 0
          ? completedFact(descriptor.id, { evidence: { artifactType: "character_cast", characterCount } })
          : pendingFact(descriptor.id, { evidence: { artifactType: "character_cast", characterCount } });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request,
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        return characterCount > 0
          ? buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "角色准备已完成",
            evidence: { artifactType: "character_cast", characterCount },
          })
          : buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "等待补齐角色阵容",
            nextAction: "run_character_setup",
          });
      },
      recover: async (_context) => ({
        recoverable: true,
        resumeFrom: "character_setup",
        reason: "Character setup can resume from the current workspace.",
      }),
      completeCriteria: async () => true,
    },
  );
}

function createVolumeStrategyExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, VolumePlanDocument | null> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeVolumeStrategyStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        if (characterCount === 0) {
          return blockedState("Character setup is required before volume strategy.", {
            code: "missing_character_setup",
            evidence: { characterCount },
            nextAction: "run_character_setup",
          });
        }
        return readyState({
          evidence: {
            artifactType: "volume_strategy",
            hasStrategyPlan: Boolean(workspace?.strategyPlan),
            volumeCount: workspace?.volumes.length ?? 0,
          },
        });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        return workspace?.strategyPlan && workspace.volumes.length > 0
          ? completedFact(descriptor.id, {
            evidence: { artifactType: "volume_strategy", volumeCount: workspace.volumes.length },
          })
          : pendingFact(descriptor.id, {
            ratio: workspace?.strategyPlan ? 0.5 : 0,
            evidence: {
              artifactType: "volume_strategy",
              hasStrategyPlan: Boolean(workspace?.strategyPlan),
              volumeCount: workspace?.volumes.length ?? 0,
            },
          });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request,
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        return workspace?.strategyPlan && workspace.volumes.length > 0
          ? buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "分卷策略已完成",
            evidence: { artifactType: "volume_strategy", volumeCount: workspace.volumes.length },
          })
          : buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "等待生成分卷策略",
            nextAction: "run_volume_strategy",
          });
      },
      recover: async (_context) => ({
        recoverable: true,
        resumeFrom: "volume_strategy",
        reason: "Volume strategy can resume from the current workspace.",
      }),
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        return Boolean(workspace?.strategyPlan) && (workspace?.volumes.length ?? 0) > 0;
      },
    },
  );
}

function createStructuredOutlineExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest; baseWorkspace: VolumePlanDocument }, void> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeStructuredOutlineStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        if (!workspace || !workspace.strategyPlan || characterCount === 0) {
          return blockedState("Volume strategy and character setup must exist before structured outline.", {
            code: "missing_structured_outline_inputs",
            evidence: { characterCount, hasVolumeStrategy: Boolean(workspace?.strategyPlan) },
            nextAction: "prepare_upstream_assets",
          });
        }
        return readyState({ evidence: { artifactType: "chapter_task_sheet" } });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const chapterCount = workspace?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0;
        return chapterCount > 0
          ? completedFact(descriptor.id, { evidence: { artifactType: "chapter_task_sheet", chapterCount } })
          : pendingFact(descriptor.id, { evidence: { artifactType: "chapter_task_sheet", chapterCount } });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        const baseWorkspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        if (!baseWorkspace) {
          throw new Error("Structured outline requires an existing volume strategy workspace.");
        }
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request,
          baseWorkspace,
        };
      },
      validateOutput: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const chapterCount = workspace?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0;
        return {
          valid: chapterCount > 0,
          reason: chapterCount > 0 ? undefined : "Structured outline did not produce chapter tasks.",
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const chapterCount = workspace?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0;
        const hasStrategy = Boolean(workspace?.strategyPlan);
        if (chapterCount > 0) {
          return buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "章节任务单已完成",
            evidence: { artifactType: "chapter_task_sheet", chapterCount },
          });
        }
        return buildSimpleProgress({
          status: hasStrategy ? "partially_done" : "not_started",
          ratio: hasStrategy ? 0.5 : 0,
          label: hasStrategy ? "已具备卷策略，等待生成章节任务单" : "等待卷策略与角色准备完成",
          evidence: { hasVolumeStrategy: hasStrategy, chapterCount },
          nextAction: hasStrategy ? "run_structured_outline" : "prepare_upstream_assets",
        });
      },
      recover: async (context) => {
        const { novelId, state } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const chapterCount = workspace?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0;
        if (chapterCount > 0) {
          await getDirectorCoreStateCommitter().recordRecoveryHint({
            taskId: state.task.id,
            novelId,
            runtimeId: state.runtime?.id ?? null,
            nodeKey: descriptor.nodeKey,
            reason: "Structured outline artifacts already exist.",
            resumeFrom: "chapter_task_sheet_artifact",
          });
          return { recoverable: true, resumeFrom: "chapter_task_sheet_artifact", reason: "Structured outline artifacts already exist." };
        }
        return { recoverable: true, resumeFrom: "structured_outline", reason: "Structured outline can resume from the current workspace." };
      },
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        return (workspace?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0) > 0;
      },
    },
  );
}

type StructuredOutlineFactStep = "beat_sheet" | "chapter_list" | "chapter_detail_bundle";

function buildStructuredOutlineStepDescriptor(input: {
  id: string;
  nodeKey: string;
  label: string;
  defaultWaitingState: WorkflowStepModuleDescriptor["defaultWaitingState"];
}): WorkflowStepModuleDescriptor {
  return {
    id: input.id,
    nodeKey: input.nodeKey,
    label: input.label,
    stage: "structured_outline",
    targetType: "novel",
    reads: ["volume_strategy", "character_cast", "chapter_task_sheet"],
    writes: ["chapter_task_sheet"],
    mayModifyUserContent: true,
    requiresApprovalByDefault: false,
    supportsAutoRetry: true,
    defaultWaitingState: input.defaultWaitingState,
  };
}

async function inspectStructuredOutlineFactState(
  context: WorkflowStepExecutionContext,
  step: StructuredOutlineFactStep,
) {
  const { novelId, request } = await loadDirectorModuleState(context);
  const runtime = getDirectorCoreStepRuntime();
  const workspace = await runtime.getVolumeWorkspace(novelId);
  const characterCount = (await runtime.getCharacters(novelId)).length;
  const cursor = workspace ? await runtime.getStructuredOutlineRecoveryCursor(novelId, request) : null;
  const hasStrategy = Boolean(workspace?.strategyPlan);
  const beatsReady = cursor ? cursor.step !== "beat_sheet" : false;
  const chapterListReady = cursor ? (cursor.step === "chapter_detail_bundle" || cursor.step === "chapter_sync" || cursor.step === "completed") : false;
  const detailReady = cursor ? (cursor.step === "chapter_sync" || cursor.step === "completed") : false;
  const selectedChapterCount = cursor?.selectedChapters.length ?? 0;
  const evidence = {
    hasVolumeStrategy: hasStrategy,
    characterCount,
    cursorStep: cursor?.step ?? null,
    preparedVolumeIds: cursor?.preparedVolumeIds ?? [],
    selectedChapterCount,
  };
  if (!workspace || !hasStrategy || characterCount === 0) {
    return {
      readiness: blockedState("Volume strategy and character setup must exist before structured outline.", {
        code: "missing_structured_outline_inputs",
        evidence,
        nextAction: "prepare_upstream_assets",
      }),
      completion: pendingFact(step === "beat_sheet"
        ? DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.beat_sheet
        : step === "chapter_list"
          ? DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list
          : DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle, { evidence }),
      progress: buildSimpleProgress({
        status: "blocked",
        ratio: 0,
        label: "等待卷战略与角色准备完成",
        evidence,
        nextAction: "prepare_upstream_assets",
      }),
    };
  }

  if (step === "beat_sheet") {
    return {
      readiness: readyState({ evidence, resumeFrom: cursor?.step ?? "beat_sheet" }),
      completion: beatsReady
        ? completedFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.beat_sheet, { evidence })
        : pendingFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.beat_sheet, { evidence }),
      progress: buildSimpleProgress({
        status: beatsReady ? "completed" : "partially_done",
        ratio: beatsReady ? 1 : 0.25,
        label: beatsReady ? "卷节奏板已就绪" : "正在准备卷节奏板",
        evidence,
        nextAction: beatsReady ? "run_chapter_list_generation" : "run_beat_sheet_generation",
      }),
    };
  }

  if (step === "chapter_list") {
    const ready = beatsReady;
    return {
      readiness: ready
        ? readyState({ evidence, resumeFrom: cursor?.step ?? "chapter_list" })
        : blockedState("Beat sheet must exist before chapter list generation.", {
          code: "missing_beat_sheet",
          evidence,
          nextAction: "run_beat_sheet_generation",
        }),
      completion: chapterListReady
        ? completedFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list, { evidence })
        : pendingFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list, {
          ratio: beatsReady ? 0.5 : 0,
          evidence,
        }),
      progress: buildSimpleProgress({
        status: chapterListReady ? "completed" : beatsReady ? "partially_done" : "blocked",
        ratio: chapterListReady ? 1 : beatsReady ? 0.5 : 0,
        label: chapterListReady ? "卷拆章列表已就绪" : beatsReady ? "正在生成章节列表" : "等待卷节奏板完成",
        evidence,
        nextAction: chapterListReady ? "run_chapter_detail_generation" : beatsReady ? "run_chapter_list_generation" : "run_beat_sheet_generation",
      }),
    };
  }

  const ready = chapterListReady;
  return {
    readiness: ready
      ? readyState({ evidence, resumeFrom: cursor?.step ?? "chapter_detail_bundle" })
      : blockedState("Chapter list must exist before chapter detail generation.", {
        code: "missing_chapter_list",
        evidence,
        nextAction: "run_chapter_list_generation",
      }),
    completion: detailReady
      ? completedFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle, { evidence })
      : pendingFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle, {
        ratio: selectedChapterCount > 0 && cursor?.totalDetailSteps
          ? cursor.completedDetailSteps / cursor.totalDetailSteps
          : chapterListReady ? 0.6 : 0,
        evidence,
      }),
    progress: buildSimpleProgress({
      status: detailReady ? "completed" : chapterListReady ? "partially_done" : "blocked",
      ratio: detailReady ? 1 : selectedChapterCount > 0 && cursor?.totalDetailSteps
        ? cursor.completedDetailSteps / cursor.totalDetailSteps
        : chapterListReady ? 0.6 : 0,
      label: detailReady ? "章节任务单与执行细化已就绪" : chapterListReady ? "正在细化章节执行资源" : "等待章节列表完成",
      evidence,
      nextAction: detailReady ? "sync_execution_contracts" : chapterListReady ? "run_chapter_detail_generation" : "run_chapter_list_generation",
    }),
  };
}

function createStructuredOutlineFactModule(input: {
  step: StructuredOutlineFactStep;
  descriptor: WorkflowStepModuleDescriptor;
}): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, void> {
  return createWorkflowStepModule(
    input.descriptor,
    async (moduleInput) => getDirectorCoreStepRuntime().executeStructuredOutlineFactStep(moduleInput),
    {
      inspectReadiness: async (context) => (await inspectStructuredOutlineFactState(context, input.step)).readiness,
      inspectCompletion: async (context) => (await inspectStructuredOutlineFactState(context, input.step)).completion,
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request,
        };
      },
      validateOutput: async (_output, context) => {
        const result = await inspectStructuredOutlineFactState(context, input.step);
        return {
          valid: result.completion.completed,
          reason: result.completion.completed ? undefined : `${input.descriptor.id} did not produce the expected structured outline facts.`,
          evidence: result.completion.evidence,
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          input.descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: input.descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => (await inspectStructuredOutlineFactState(context, input.step)).progress,
      recover: async (context) => {
        const { novelId, state } = await loadDirectorModuleState(context);
        const cursor = await getDirectorCoreStepRuntime().getStructuredOutlineRecoveryCursor(novelId, state.seedPayload ? getDirectorInputFromSeedPayload(state.seedPayload) : null);
        const resumeFrom = cursor?.step ?? input.step;
        await getDirectorCoreStateCommitter().recordRecoveryHint({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: input.descriptor.nodeKey,
          reason: "Structured outline can resume from the latest observable outline facts.",
          resumeFrom,
        });
        return {
          recoverable: true,
          resumeFrom,
          reason: "Structured outline can resume from the latest observable outline facts.",
        };
      },
      completeCriteria: async (_output, context) => (await inspectStructuredOutlineFactState(context, input.step)).completion.completed,
    },
  );
}

function createChapterDraftExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  existingPipelineJobId?: string | null;
  existingState?: DirectorAutoExecutionState | null;
  resumeCheckpointType?: "front10_ready" | "chapter_batch_ready" | "replan_required" | null;
  previousFailureMessage?: string | null;
  allowSkipReviewBlockedChapter?: boolean;
}, void> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeChapterDraftStep(input),
    {
      inspectReadiness: async (context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const chapterProgress = state.chapterProgress ?? await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
        const executionChapters = await getDirectorCoreStepRuntime().getExecutionChapters(novelId);
        const syncedChapterCount = executionChapters.filter((chapter) => hasDirectorSyncedChapterExecutionContext(chapter)).length;
        if (syncedChapterCount === 0) {
          return blockedState("Formal chapters with synced execution context are required before chapter execution.", {
            code: "missing_execution_contract_sync",
            evidence: { chapterCount: executionChapters.length, syncedChapterCount },
            nextAction: "sync_execution_contracts",
          });
        }
        return readyState({
          evidence: {
            syncedChapterCount,
            draftedChapterCount: chapterProgress?.draftedChapterCount ?? 0,
            completedChapters: chapterProgress?.completedChapters ?? 0,
          },
        });
      },
      inspectCompletion: async (context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const chapterProgress = state.chapterProgress ?? await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
        const draftedChapterCount = chapterProgress?.draftedChapterCount ?? 0;
        const totalChapters = chapterProgress?.totalChapters ?? 0;
        return totalChapters > 0 && draftedChapterCount >= totalChapters
          ? completedFact(descriptor.id, {
            evidence: {
              draftedChapterCount,
              approvedChapterCount: chapterProgress?.approvedChapterCount ?? 0,
              completedChapters: chapterProgress?.completedChapters ?? 0,
              totalChapters,
            },
          })
          : pendingFact(descriptor.id, {
            ratio: totalChapters > 0 ? Math.min(1, draftedChapterCount / totalChapters) : 0,
            evidence: {
              draftedChapterCount,
              approvedChapterCount: chapterProgress?.approvedChapterCount ?? 0,
              completedChapters: chapterProgress?.completedChapters ?? 0,
              needsRepairChapters: chapterProgress?.needsRepairChapters ?? 0,
              totalChapters,
            },
          });
      },
      buildInput: async (context) => {
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const requestedAutoExecutionContinue = state.task.status === "failed" || state.task.status === "cancelled";
        return {
          taskId: state.task.id,
          novelId,
          request,
          existingPipelineJobId: state.seedPayload.autoExecution?.pipelineJobId ?? null,
          existingState: state.seedPayload.autoExecution ?? null,
          resumeCheckpointType: (
            state.task.checkpointType === "chapter_batch_ready"
            || state.task.checkpointType === "replan_required"
            || state.task.checkpointType === "front10_ready"
          )
            ? state.task.checkpointType
            : "front10_ready",
          previousFailureMessage: state.task.lastError ?? null,
          allowSkipReviewBlockedChapter: requestedAutoExecutionContinue && isDirectorAutoExecutionRunMode(request.runMode),
        };
      },
      validateOutput: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
        return {
          valid: Boolean(progress && progress.totalChapters > 0),
          reason: progress?.totalChapters ? undefined : "Chapter execution did not produce observable chapter progress.",
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
        if (!progress || progress.totalChapters === 0) {
          return buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "\u7b49\u5f85\u8fdb\u5165\u7ae0\u8282\u6267\u884c",
            nextAction: "run_chapter_execution",
          });
        }
        const draftedRatio = progress.totalChapters > 0
          ? Math.min(1, progress.draftedChapterCount / progress.totalChapters)
          : 0;
        if (progress.totalChapters > 0 && progress.draftedChapterCount >= progress.totalChapters) {
          return buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "\u6b63\u6587\u5df2\u5168\u90e8\u751f\u6210",
            evidence: {
              draftedChapterCount: progress.draftedChapterCount,
              approvedChapterCount: progress.approvedChapterCount,
              completedChapters: progress.completedChapters,
              totalChapters: progress.totalChapters,
              needsRepairChapters: progress.needsRepairChapters,
            },
            nextAction: progress.needsRepairChapters > 0 ? "repair_chapter" : "run_quality_review",
          });
        }
        return buildSimpleProgress({
          status: "partially_done",
          ratio: draftedRatio,
          label: progress.currentChapterOrder
            ? `\u6b63\u5728\u63a8\u8fdb\u7b2c ${progress.currentChapterOrder} \u7ae0`
            : "\u6b63\u5728\u63a8\u8fdb\u7ae0\u8282\u6267\u884c",
          evidence: {
            draftedChapterCount: progress.draftedChapterCount,
            approvedChapterCount: progress.approvedChapterCount,
            completedChapters: progress.completedChapters,
            needsRepairChapters: progress.needsRepairChapters,
            totalChapters: progress.totalChapters,
          },
          nextAction: "continue_chapter_execution",
        });
      },
      recover: async (context) => {
        const { novelId, state } = await loadDirectorModuleState(context);
        const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
        const resumeFrom = progress?.currentChapterOrder
          ? `chapter:${progress.currentChapterOrder}`
          : "chapter_execution";
        await getDirectorCoreStateCommitter().recordRecoveryHint({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          reason: "Chapter execution can resume from the latest observable progress.",
          resumeFrom,
        });
        return {
          recoverable: Boolean(progress?.recoverableRange),
          resumeFrom,
          reason: progress?.recoverableRange
            ? "Chapter execution can resume from the latest observable progress."
            : "Chapter execution requires a new start point.",
        };
      },
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
        return Boolean(
          progress
          && progress.totalChapters > 0
          && progress.draftedChapterCount >= progress.totalChapters,
        );
      },
    },
  );
}

function createChapterExecutionContractSyncModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ novelId: string }, void> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeChapterExecutionContractSyncStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const executionChapters = await getDirectorCoreStepRuntime().getExecutionChapters(novelId);
        const plannedChapterOrders = workspace?.volumes.flatMap((volume) => (
          volume.chapters
            .map((chapter) => chapter.chapterOrder)
            .filter((order) => Number.isFinite(order))
        )) ?? [];
        const plannedChapterCount = plannedChapterOrders.length;
        const syncedChapterCount = countMaterializedExecutionChapters({
          plannedChapterOrders,
          executionChapters,
        });
        if (plannedChapterCount === 0) {
          return blockedState("Chapter planning must finish before formal chapter sync.", {
            code: "missing_chapter_plan",
            evidence: { plannedChapterCount, syncedChapterCount },
            nextAction: "run_chapter_detail_generation",
          });
        }
        return readyState({
          evidence: { plannedChapterCount, syncedChapterCount },
          resumeFrom: syncedChapterCount >= plannedChapterCount ? "chapter_execution_contract_sync_done" : "chapter_execution_contract_sync",
        });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const executionChapters = await getDirectorCoreStepRuntime().getExecutionChapters(novelId);
        const plannedChapterOrders = workspace?.volumes.flatMap((volume) => (
          volume.chapters
            .map((chapter) => chapter.chapterOrder)
            .filter((order) => Number.isFinite(order))
        )) ?? [];
        const plannedChapterCount = plannedChapterOrders.length;
        const syncedChapterCount = countMaterializedExecutionChapters({
          plannedChapterOrders,
          executionChapters,
        });
        return plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount
          ? completedFact(descriptor.id, { evidence: { plannedChapterCount, syncedChapterCount } })
          : pendingFact(descriptor.id, {
            ratio: plannedChapterCount > 0 ? Math.min(1, syncedChapterCount / plannedChapterCount) : 0,
            evidence: { plannedChapterCount, syncedChapterCount },
          });
      },
      buildInput: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return { novelId };
      },
      validateOutput: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const executionChapters = await getDirectorCoreStepRuntime().getExecutionChapters(novelId);
        const plannedChapterOrders = workspace?.volumes.flatMap((volume) => (
          volume.chapters
            .map((chapter) => chapter.chapterOrder)
            .filter((order) => Number.isFinite(order))
        )) ?? [];
        const plannedChapterCount = plannedChapterOrders.length;
        const syncedChapterCount = countMaterializedExecutionChapters({
          plannedChapterOrders,
          executionChapters,
        });
        return {
          valid: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount,
          reason: "Formal chapter sync did not materialize the planned chapter records.",
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          ["chapter_task_sheet"],
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return {
          producedArtifacts,
          summary: "章节规划已同步到正式章节执行区。",
        };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const executionChapters = await getDirectorCoreStepRuntime().getExecutionChapters(novelId);
        const plannedChapterOrders = workspace?.volumes.flatMap((volume) => (
          volume.chapters
            .map((chapter) => chapter.chapterOrder)
            .filter((order) => Number.isFinite(order))
        )) ?? [];
        const plannedChapterCount = plannedChapterOrders.length;
        const syncedChapterCount = countMaterializedExecutionChapters({
          plannedChapterOrders,
          executionChapters,
        });
        return buildSimpleProgress({
          status: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount ? "completed" : "partially_done",
          ratio: plannedChapterCount > 0 ? Math.min(1, syncedChapterCount / plannedChapterCount) : 0,
          label: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount
            ? "正式章节已同步完成"
            : "正在把章节规划同步到正式章节执行区",
          evidence: { plannedChapterCount, syncedChapterCount },
          nextAction: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount ? null : "sync_execution_contracts",
        });
      },
      recover: async (_context) => ({
        recoverable: true,
        resumeFrom: "chapter_execution_contract_sync",
        reason: "Formal chapter sync can rerun from the current workspace.",
      }),
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const executionChapters = await getDirectorCoreStepRuntime().getExecutionChapters(novelId);
        const plannedChapterOrders = workspace?.volumes.flatMap((volume) => (
          volume.chapters
            .map((chapter) => chapter.chapterOrder)
            .filter((order) => Number.isFinite(order))
        )) ?? [];
        const plannedChapterCount = plannedChapterOrders.length;
        const syncedChapterCount = countMaterializedExecutionChapters({
          plannedChapterOrders,
          executionChapters,
        });
        return plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount;
      },
    },
  );
}

async function collectRuntimeArtifactsForTypes(context: WorkflowStepExecutionContext, types: string[]) {
  const { state, novelId } = await loadDirectorModuleState(context);
  const artifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(novelId, state.task.id, types);
  return { state, novelId, artifacts };
}

function createFactOnlyExecutionModule(input: {
  descriptor: WorkflowStepModuleDescriptor;
  inspectFacts: (context: WorkflowStepExecutionContext) => Promise<{
    readiness: ReturnType<typeof readyState> | ReturnType<typeof blockedState>;
    completion: ReturnType<typeof completedFact> | ReturnType<typeof pendingFact>;
    progress: WorkflowStepProgress;
  }>;
}): WorkflowStepModule<{ taskId: string; novelId: string }, void> {
  return createWorkflowStepModule(
    input.descriptor,
    async (): Promise<void> => {},
    {
      inspectReadiness: async (context) => (await input.inspectFacts(context)).readiness,
      inspectCompletion: async (context) => (await input.inspectFacts(context)).completion,
      buildInput: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
        };
      },
      validateOutput: async (_output, context) => {
        const facts = await input.inspectFacts(context);
        return {
          valid: facts.completion.completed,
          reason: facts.completion.completed ? undefined : `${input.descriptor.id} facts are not complete yet.`,
          evidence: facts.completion.evidence,
        };
      },
      commit: async (_output, context) => {
        const { state, novelId, artifacts } = await collectRuntimeArtifactsForTypes(context, input.descriptor.writes);
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: input.descriptor.nodeKey,
          artifacts,
        });
        return { producedArtifacts: artifacts };
      },
      inspectProgress: async (context) => (await input.inspectFacts(context)).progress,
      recover: async (context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        await getDirectorCoreStateCommitter().recordRecoveryHint({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: input.descriptor.nodeKey,
          reason: `${input.descriptor.label} can resume from observable execution artifacts.`,
          resumeFrom: input.descriptor.id,
        });
        return {
          recoverable: true,
          resumeFrom: input.descriptor.id,
          reason: `${input.descriptor.label} can resume from observable execution artifacts.`,
        };
      },
      completeCriteria: async (_output, context) => (await input.inspectFacts(context)).completion.completed,
    },
  );
}

function chapterHasCompletedStage(
  chapter: { completedStages?: string[] | null },
  stage: string,
): boolean {
  return Array.isArray(chapter.completedStages) && chapter.completedStages.includes(stage);
}

function uniqueModules(
  modules: readonly WorkflowStepModuleDescriptor[],
): WorkflowStepModuleDescriptor[] {
  const seen = new Set<string>();
  return modules.filter((module) => {
    if (seen.has(module.id)) {
      return false;
    }
    seen.add(module.id);
    return true;
  });
}

export const DIRECTOR_CANDIDATE_STEP_MODULES: Record<
  DirectorCandidateStageNode,
  WorkflowStepModuleDescriptor
> = Object.fromEntries(
  Object.entries(DIRECTOR_CANDIDATE_NODE_ADAPTERS).map(([stage, adapter]) => [
    stage,
    createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_CANDIDATE_STEP_IDS[stage as DirectorCandidateStageNode],
      stage: "candidate_selection",
      adapter,
    }),
  ]),
) as Record<DirectorCandidateStageNode, WorkflowStepModuleDescriptor>;

export const DIRECTOR_PLANNING_STEP_MODULES: Record<
  DirectorPlanningStage,
  WorkflowStepModuleDescriptor
> = {
  story_macro: createStoryMacroExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.story_macro,
    stage: "story_macro",
    adapter: getDirectorStageNodeAdapter("story_macro"),
  })),
  book_contract: createBookContractExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.book_contract,
    stage: "story_macro",
    adapter: getDirectorStageNodeAdapter("book_contract"),
  })),
  character_setup: createCharacterSetupExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.character_setup,
    stage: "character_setup",
    adapter: getDirectorStageNodeAdapter("character_setup"),
  })),
  volume_strategy: createVolumeStrategyExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.volume_strategy,
    stage: "volume_strategy",
    adapter: getDirectorStageNodeAdapter("volume_strategy"),
  })),
  structured_outline: createStructuredOutlineFactModule({
    step: "beat_sheet",
    descriptor: buildStructuredOutlineStepDescriptor({
      id: DIRECTOR_PLANNING_STEP_IDS.structured_outline,
      nodeKey: "volume_beat_sheet_generate",
      label: "生成目标卷节奏板",
      defaultWaitingState: {
        stage: "structured_outline",
        itemKey: "beat_sheet",
        itemLabel: "等待卷节奏板准备完成",
        progress: 0.72,
      },
    }),
  }),
};

export const DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES = {
  beat_sheet: DIRECTOR_PLANNING_STEP_MODULES.structured_outline,
  chapter_list: createStructuredOutlineFactModule({
    step: "chapter_list",
    descriptor: buildStructuredOutlineStepDescriptor({
      id: DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list,
      nodeKey: "volume_chapter_list_generate",
      label: "生成卷拆章列表",
      defaultWaitingState: {
        stage: "structured_outline",
        itemKey: "chapter_list",
        itemLabel: "等待卷拆章列表准备完成",
        progress: 0.8,
      },
    }),
  }),
  chapter_detail_bundle: createStructuredOutlineFactModule({
    step: "chapter_detail_bundle",
    descriptor: buildStructuredOutlineStepDescriptor({
      id: DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle,
      nodeKey: "volume_chapter_detail_bundle_generate",
      label: "细化章节任务单与执行资源",
      defaultWaitingState: {
        stage: "structured_outline",
        itemKey: "chapter_detail_bundle",
        itemLabel: "等待章节任务单与执行资源准备完成",
        progress: 0.88,
      },
    }),
  }),
} as const;

export const DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE = createChapterExecutionContractSyncModule({
  id: DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_ID,
  nodeKey: "chapter_execution_contract_sync",
  label: "同步章节执行合同",
  stage: "structured_outline",
  targetType: "novel",
  reads: ["chapter_task_sheet"],
  writes: ["chapter_task_sheet"],
  mayModifyUserContent: false,
  requiresApprovalByDefault: false,
  supportsAutoRetry: true,
  defaultWaitingState: {
    stage: "structured_outline",
    itemKey: "chapter_sync",
    itemLabel: "正在同步正式章节执行合同",
    progress: 0.9,
  },
});

export const DIRECTOR_EXECUTION_STEP_MODULES: Record<
  DirectorExecutionStage,
  WorkflowStepModuleDescriptor
> = {
  chapter_execution: createChapterDraftExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_execution,
    stage: "chapter_execution",
    adapter: getDirectorExecutionNodeAdapter("chapter_execution"),
    promptAssets: [{ id: "novel.chapter.writer", version: "v5" }],
  })),
  chapter_quality_review: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("chapter_quality_review"),
      promptAssets: [{ id: "audit.chapter.full", version: "v2" }],
    }),
    inspectFacts: async (context) => {
      const { novelId } = await loadDirectorModuleState(context);
      const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
      const drafted = progress?.chapters?.filter((chapter) => chapterHasCompletedStage(chapter, "draft_saved")) ?? [];
      const reviewed = drafted.filter((chapter) => chapterHasCompletedStage(chapter, "audit_completed")).length;
      return {
        readiness: drafted.length > 0
          ? readyState({ evidence: { draftedChapterCount: drafted.length, reviewedChapterCount: reviewed } })
          : blockedState("Draft chapters are required before quality review.", {
            code: "missing_chapter_drafts",
            nextAction: "continue_chapter_execution",
          }),
        completion: drafted.length > 0 && reviewed >= drafted.length
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review, { evidence: { draftedChapterCount: drafted.length, reviewedChapterCount: reviewed } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review, {
            ratio: drafted.length > 0 ? reviewed / drafted.length : 0,
            evidence: { draftedChapterCount: drafted.length, reviewedChapterCount: reviewed },
          }),
        progress: buildSimpleProgress({
          status: drafted.length > 0 && reviewed >= drafted.length ? "completed" : drafted.length > 0 ? "partially_done" : "blocked",
          ratio: drafted.length > 0 ? reviewed / drafted.length : 0,
          label: drafted.length > 0 && reviewed >= drafted.length ? "章节审校已完成" : "正在根据最新正文补齐审校结果",
          evidence: { draftedChapterCount: drafted.length, reviewedChapterCount: reviewed },
          nextAction: drafted.length > 0 && reviewed >= drafted.length ? "commit_chapter_state" : "run_quality_review",
        }),
      };
    },
  }),
  chapter_repair: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.chapter_repair,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("chapter_repair"),
    }),
    inspectFacts: async (context) => {
      const { novelId } = await loadDirectorModuleState(context);
      const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
      return {
        readiness: readyState({ evidence: { needsRepairChapters: progress?.needsRepairChapters ?? 0 } }),
        completion: (progress?.needsRepairChapters ?? 0) === 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, { evidence: { needsRepairChapters: 0 } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, {
            ratio: progress?.totalChapters ? 1 - ((progress.needsRepairChapters ?? 0) / progress.totalChapters) : 0,
            evidence: { needsRepairChapters: progress?.needsRepairChapters ?? 0, totalChapters: progress?.totalChapters ?? 0 },
          }),
        progress: buildSimpleProgress({
          status: (progress?.needsRepairChapters ?? 0) === 0 ? "completed" : "needs_review",
          ratio: progress?.totalChapters ? 1 - ((progress.needsRepairChapters ?? 0) / progress.totalChapters) : 0,
          label: (progress?.needsRepairChapters ?? 0) === 0 ? "章节修复已收敛" : "仍有章节处于待修复状态",
          evidence: { needsRepairChapters: progress?.needsRepairChapters ?? 0 },
          nextAction: (progress?.needsRepairChapters ?? 0) === 0 ? "run_quality_review" : "repair_chapter",
        }),
      };
    },
  }),
  chapter_state_commit: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("chapter_state_commit"),
    }),
    inspectFacts: async (context) => {
      const { novelId } = await loadDirectorModuleState(context);
      const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
      const drafted = progress?.chapters?.filter((chapter) => chapterHasCompletedStage(chapter, "draft_saved")) ?? [];
      const committed = drafted.filter((chapter) => chapterHasCompletedStage(chapter, "chapter_state_committed")).length;
      return {
        readiness: drafted.length > 0
          ? readyState({ evidence: { draftedChapterCount: drafted.length, committedChapterCount: committed } })
          : blockedState("Chapter state commit requires drafted chapters.", { code: "missing_chapter_drafts", nextAction: "continue_chapter_execution" }),
        completion: drafted.length > 0 && committed >= drafted.length
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit, { evidence: { draftedChapterCount: drafted.length, committedChapterCount: committed } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit, {
            ratio: drafted.length > 0 ? committed / drafted.length : 0,
            evidence: { draftedChapterCount: drafted.length, committedChapterCount: committed },
          }),
        progress: buildSimpleProgress({
          status: drafted.length > 0 && committed >= drafted.length ? "completed" : drafted.length > 0 ? "partially_done" : "blocked",
          ratio: drafted.length > 0 ? committed / drafted.length : 0,
          label: drafted.length > 0 && committed >= drafted.length ? "章节状态提交已完成" : "正在补齐章节状态提交",
          evidence: { draftedChapterCount: drafted.length, committedChapterCount: committed },
          nextAction: drafted.length > 0 && committed >= drafted.length ? "sync_payoff_ledger" : "commit_state",
        }),
      };
    },
  }),
  payoff_ledger_sync: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("payoff_ledger_sync"),
      promptAssets: [{ id: "novel.payoff_ledger.sync", version: "v5" }],
    }),
    inspectFacts: async (context) => {
      const { artifacts } = await collectRuntimeArtifactsForTypes(context, ["reader_promise", "repair_ticket"]);
      const activeArtifacts = artifacts.filter((artifact) => artifact.status === "active");
      return {
        readiness: readyState({ evidence: { artifactCount: activeArtifacts.length } }),
        completion: activeArtifacts.length > 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync, { evidence: { artifactCount: activeArtifacts.length }, producedArtifacts: activeArtifacts })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync, { evidence: { artifactCount: 0 } }),
        progress: buildSimpleProgress({
          status: activeArtifacts.length > 0 ? "completed" : "partially_done",
          ratio: activeArtifacts.length > 0 ? 1 : 0,
          label: activeArtifacts.length > 0 ? "伏笔账本与读者承诺已同步" : "等待同步伏笔账本与读者承诺",
          evidence: { artifactCount: activeArtifacts.length },
          nextAction: activeArtifacts.length > 0 ? "sync_character_resources" : "sync_payoff_ledger",
        }),
      };
    },
  }),
  character_resource_sync: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("character_resource_sync"),
    }),
    inspectFacts: async (context) => {
      const { artifacts } = await collectRuntimeArtifactsForTypes(context, ["character_governance_state", "continuity_state"]);
      const activeArtifacts = artifacts.filter((artifact) => artifact.status === "active");
      return {
        readiness: readyState({ evidence: { artifactCount: activeArtifacts.length } }),
        completion: activeArtifacts.length > 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync, { evidence: { artifactCount: activeArtifacts.length }, producedArtifacts: activeArtifacts })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync, { evidence: { artifactCount: 0 } }),
        progress: buildSimpleProgress({
          status: activeArtifacts.length > 0 ? "completed" : "partially_done",
          ratio: activeArtifacts.length > 0 ? 1 : 0,
          label: activeArtifacts.length > 0 ? "角色治理与连续性状态已同步" : "等待同步角色治理与连续性状态",
          evidence: { artifactCount: activeArtifacts.length },
          nextAction: activeArtifacts.length > 0 ? "continue_chapter_execution" : "sync_character_resources",
        }),
      };
    },
  }),
  quality_repair: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.quality_repair,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("quality_repair"),
    }),
    inspectFacts: async (context) => {
      const { novelId } = await loadDirectorModuleState(context);
      const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
      return {
        readiness: readyState({ evidence: { needsRepairChapters: progress?.needsRepairChapters ?? 0 } }),
        completion: (progress?.needsRepairChapters ?? 0) === 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.quality_repair, { evidence: { needsRepairChapters: 0 } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.quality_repair, {
            ratio: progress?.totalChapters ? 1 - ((progress.needsRepairChapters ?? 0) / progress.totalChapters) : 0,
            evidence: { needsRepairChapters: progress?.needsRepairChapters ?? 0, totalChapters: progress?.totalChapters ?? 0 },
          }),
        progress: buildSimpleProgress({
          status: (progress?.needsRepairChapters ?? 0) === 0 ? "completed" : "needs_review",
          ratio: progress?.totalChapters ? 1 - ((progress.needsRepairChapters ?? 0) / progress.totalChapters) : 0,
          label: (progress?.needsRepairChapters ?? 0) === 0 ? "质量修复链已收敛" : "仍有章节等待质量修复",
          evidence: { needsRepairChapters: progress?.needsRepairChapters ?? 0 },
          nextAction: (progress?.needsRepairChapters ?? 0) === 0 ? "continue_chapter_execution" : "repair_chapter",
        }),
      };
    },
  }),
};

export const DIRECTOR_TAKEOVER_STEP_MODULE = createWorkflowStepDescriptorFromDirectorAdapter({
  id: DIRECTOR_TAKEOVER_STEP_ID,
  stage: "takeover",
  adapter: getDirectorTakeoverNodeAdapter(),
});

export const DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE = createWorkflowStepDescriptorFromDirectorAdapter({
  id: DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID,
  stage: "candidate_confirm",
  adapter: getDirectorConfirmNovelCreateNodeAdapter(),
});

export const DIRECTOR_WORKFLOW_STEP_MODULES = uniqueModules([
  ...Object.values(DIRECTOR_CANDIDATE_STEP_MODULES),
  DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE,
  DIRECTOR_PLANNING_STEP_MODULES.story_macro,
  DIRECTOR_PLANNING_STEP_MODULES.book_contract,
  DIRECTOR_PLANNING_STEP_MODULES.character_setup,
  DIRECTOR_PLANNING_STEP_MODULES.volume_strategy,
  DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.beat_sheet,
  DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.chapter_list,
  DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.chapter_detail_bundle,
  DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE,
  ...Object.values(DIRECTOR_EXECUTION_STEP_MODULES),
  DIRECTOR_TAKEOVER_STEP_MODULE,
]);

export const directorWorkflowStepModuleRegistry = new WorkflowStepModuleRegistry(
  DIRECTOR_WORKFLOW_STEP_MODULES,
);

const REQUIRED_DIRECTOR_WRITE_CONTRACTS: Array<{
  id: string;
  writes: string[];
  mayModifyUserContent: boolean;
  requiresPolicyAction?: boolean;
}> = [
  { id: DIRECTOR_CANDIDATE_STEP_IDS.candidate_generation, writes: ["candidate_batch"], mayModifyUserContent: false },
  { id: DIRECTOR_CANDIDATE_STEP_IDS.candidate_refine, writes: ["candidate_batch"], mayModifyUserContent: false },
  { id: DIRECTOR_CANDIDATE_STEP_IDS.candidate_patch, writes: ["candidate_batch"], mayModifyUserContent: false },
  { id: DIRECTOR_CANDIDATE_STEP_IDS.candidate_title_refine, writes: ["candidate_batch"], mayModifyUserContent: false },
  { id: DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_ID, writes: ["novel_project", "director_runtime"], mayModifyUserContent: false },
  { id: DIRECTOR_TAKEOVER_STEP_ID, writes: ["workflow_task", "director_runtime"], mayModifyUserContent: false },
  { id: DIRECTOR_PLANNING_STEP_IDS.story_macro, writes: ["story_macro"], mayModifyUserContent: true },
  { id: DIRECTOR_PLANNING_STEP_IDS.book_contract, writes: ["book_contract"], mayModifyUserContent: true },
  { id: DIRECTOR_PLANNING_STEP_IDS.character_setup, writes: ["character_cast"], mayModifyUserContent: true },
  { id: DIRECTOR_PLANNING_STEP_IDS.volume_strategy, writes: ["volume_strategy"], mayModifyUserContent: true },
  { id: DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.beat_sheet, writes: ["chapter_task_sheet"], mayModifyUserContent: true },
  { id: DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list, writes: ["chapter_task_sheet"], mayModifyUserContent: true },
  { id: DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle, writes: ["chapter_task_sheet"], mayModifyUserContent: true },
  { id: DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_ID, writes: ["chapter_task_sheet"], mayModifyUserContent: false },
  { id: DIRECTOR_EXECUTION_STEP_IDS.chapter_execution, writes: ["chapter_draft"], mayModifyUserContent: true },
  { id: DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review, writes: ["audit_report", "rolling_window_review"], mayModifyUserContent: false },
  { id: DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, writes: ["chapter_draft", "audit_report", "repair_ticket"], mayModifyUserContent: true, requiresPolicyAction: true },
  { id: DIRECTOR_EXECUTION_STEP_IDS.quality_repair, writes: ["chapter_draft", "audit_report", "repair_ticket"], mayModifyUserContent: true, requiresPolicyAction: true },
  { id: DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit, writes: ["continuity_state", "character_governance_state"], mayModifyUserContent: false },
  { id: DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync, writes: ["reader_promise", "repair_ticket"], mayModifyUserContent: false },
  { id: DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync, writes: ["character_governance_state", "continuity_state"], mayModifyUserContent: false },
];

export function validateDirectorWorkflowStepWriteContracts(
  modules: readonly WorkflowStepModuleDescriptor[] = DIRECTOR_WORKFLOW_STEP_MODULES,
): void {
  const byId = new Map(modules.map((module) => [module.id, module]));
  const failures: string[] = [];
  if (byId.size !== modules.length) {
    failures.push("step ids must be unique");
  }

  for (const requirement of REQUIRED_DIRECTOR_WRITE_CONTRACTS) {
    const module = byId.get(requirement.id);
    if (!module) {
      failures.push(`${requirement.id}: missing step module`);
      continue;
    }
    for (const write of requirement.writes) {
      if (!module.writes.includes(write)) {
        failures.push(`${requirement.id}: missing write ${write}`);
      }
    }
    if (module.reads.length === 0) {
      failures.push(`${requirement.id}: reads must be declared`);
    }
    if (module.targetType !== "global" && module.targetType !== "novel" && module.targetType !== "volume" && module.targetType !== "chapter") {
      failures.push(`${requirement.id}: invalid target scope`);
    }
    if (module.mayModifyUserContent !== requirement.mayModifyUserContent) {
      failures.push(`${requirement.id}: mayModifyUserContent mismatch`);
    }
    if (typeof module.requiresApprovalByDefault !== "boolean") {
      failures.push(`${requirement.id}: requiresApprovalByDefault must be boolean`);
    }
    if (typeof module.supportsAutoRetry !== "boolean") {
      failures.push(`${requirement.id}: supportsAutoRetry must be boolean`);
    }
    if (requirement.requiresPolicyAction && !module.policyAction) {
      failures.push(`${requirement.id}: write-capable risky step must declare policyAction`);
    }
    if (module.writes.length > 0 && module.mayModifyUserContent && !module.policyAction && module.requiresApprovalByDefault) {
      failures.push(`${requirement.id}: protected write step must declare policyAction or avoid default approval`);
    }
    if (module.promptAssets?.length === 0) {
      failures.push(`${requirement.id}: promptAssets must be omitted or non-empty`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Director workflow step write contract is incomplete: ${failures.join("; ")}`);
  }
}

validateDirectorWorkflowStepWriteContracts();

export function getDirectorCandidateStepModule(
  stage: DirectorCandidateStageNode,
): WorkflowStepModuleDescriptor {
  return DIRECTOR_CANDIDATE_STEP_MODULES[stage];
}

export function getDirectorPlanningStepModule(
  stage: DirectorPlanningStage,
): WorkflowStepModuleDescriptor {
  return DIRECTOR_PLANNING_STEP_MODULES[stage];
}

export function getDirectorStructuredOutlineStepModules(): WorkflowStepModuleDescriptor[] {
  return [
    DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.beat_sheet,
    DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.chapter_list,
    DIRECTOR_STRUCTURED_OUTLINE_STEP_MODULES.chapter_detail_bundle,
    DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE,
  ];
}

export function getDirectorExecutionContractSyncStepModule(): WorkflowStepModuleDescriptor {
  return DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE;
}

export function getDirectorExecutionStepModule(
  stage: DirectorExecutionStage,
): WorkflowStepModuleDescriptor {
  return DIRECTOR_EXECUTION_STEP_MODULES[stage];
}

export function getDirectorExecutionStepModuleSequence(
  flow: DirectorExecutionFlow,
): WorkflowStepModuleDescriptor[] {
  return getDirectorExecutionNodeSequence(flow).map((adapter) => {
    const stage = Object.entries(DIRECTOR_EXECUTION_STEP_MODULES).find(([, module]) => (
      module.nodeKey === adapter.nodeKey && module.label === adapter.label
    ))?.[0] as DirectorExecutionStage | undefined;
    if (!stage) {
      throw new Error(`No workflow step module found for execution node: ${adapter.nodeKey}`);
    }
    return getDirectorExecutionStepModule(stage);
  });
}

export function getDirectorTakeoverStepModule(): WorkflowStepModuleDescriptor {
  return DIRECTOR_TAKEOVER_STEP_MODULE;
}

export function getDirectorConfirmNovelCreateStepModule(): WorkflowStepModuleDescriptor {
  return DIRECTOR_CONFIRM_NOVEL_CREATE_STEP_MODULE;
}
