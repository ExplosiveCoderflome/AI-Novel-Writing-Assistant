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
  structured_outline: "chapter.task_sheet.plan",
};

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

function createStoryMacroExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, StoryMacroPlan> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeStoryMacroStep(input),
    {
      inspect: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        if (plan?.decomposition && typeof plan.storyInput === "string" && plan.storyInput.trim()) {
          return { status: "completed", evidence: { artifactType: "story_macro" } };
        }
        return { status: "ready", evidence: { artifactType: "story_macro" } };
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
      inspect: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        if (contract) {
          return { status: "completed", evidence: { artifactType: "book_contract" } };
        }
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        if (!plan?.decomposition) {
          return { status: "blocked", reason: "Story macro is required before book contract.", evidence: { artifactType: "story_macro" } };
        }
        return { status: "ready", evidence: { artifactType: "book_contract" } };
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

function createStructuredOutlineExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest; baseWorkspace: VolumePlanDocument }, void> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeStructuredOutlineStep(input),
    {
      inspect: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        const chapterCount = workspace?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0;
        if (chapterCount > 0) {
          return { status: "completed", evidence: { artifactType: "chapter_task_sheet", chapterCount } };
        }
        if (!workspace || !workspace.strategyPlan || characterCount === 0) {
          return { status: "blocked", reason: "Volume strategy and character setup must exist before structured outline.", evidence: { characterCount, hasVolumeStrategy: Boolean(workspace?.strategyPlan) } };
        }
        return { status: "ready", evidence: { artifactType: "chapter_task_sheet" } };
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
      inspect: async (context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const chapterProgress = state.chapterProgress ?? await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
        const executionChapters = await getDirectorCoreStepRuntime().getExecutionChapters(novelId);
        const syncedChapterCount = executionChapters.filter((chapter) => hasDirectorSyncedChapterExecutionContext(chapter)).length;
        if (chapterProgress?.ratio === 1 && chapterProgress.totalChapters > 0) {
          return { status: "completed", evidence: { completedChapters: chapterProgress.completedChapters } };
        }
        if (syncedChapterCount === 0) {
          return {
            status: "blocked",
            reason: "Formal chapters with synced execution context are required before chapter execution.",
            evidence: { chapterCount: executionChapters.length, syncedChapterCount },
          };
        }
        return { status: "ready", evidence: { syncedChapterCount } };
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
            label: "等待进入章节执行",
            nextAction: "run_chapter_execution",
          });
        }
        if (progress.ratio >= 1) {
          return buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "章节执行已完成",
            evidence: {
              completedChapters: progress.completedChapters,
              totalChapters: progress.totalChapters,
            },
          });
        }
        return buildSimpleProgress({
          status: progress.needsRepairChapters > 0 ? "needs_review" : "partially_done",
          ratio: progress.ratio,
          label: progress.currentChapterOrder
            ? `正在推进第 ${progress.currentChapterOrder} 章`
            : "正在推进章节执行",
          evidence: {
            completedChapters: progress.completedChapters,
            needsRepairChapters: progress.needsRepairChapters,
            totalChapters: progress.totalChapters,
          },
          nextAction: progress.needsRepairChapters > 0 ? "repair_chapter" : "continue_chapter_execution",
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
        return Boolean(progress && progress.totalChapters > 0 && progress.ratio >= 1);
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
      inspect: async (context) => {
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
          return {
            status: "blocked",
            reason: "Chapter planning must finish before formal chapter sync.",
            evidence: { plannedChapterCount, syncedChapterCount },
          };
        }
        if (syncedChapterCount >= plannedChapterCount) {
          return {
            status: "completed",
            evidence: { plannedChapterCount, syncedChapterCount },
          };
        }
        return {
          status: "ready",
          evidence: { plannedChapterCount, syncedChapterCount },
        };
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
  character_setup: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.character_setup,
    stage: "character_setup",
    adapter: getDirectorStageNodeAdapter("character_setup"),
  }),
  volume_strategy: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.volume_strategy,
    stage: "volume_strategy",
    adapter: getDirectorStageNodeAdapter("volume_strategy"),
  }),
  structured_outline: createStructuredOutlineExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.structured_outline,
    stage: "structured_outline",
    adapter: getDirectorStageNodeAdapter("structured_outline"),
  })),
};

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
  chapter_quality_review: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("chapter_quality_review"),
    promptAssets: [{ id: "audit.chapter.full", version: "v2" }],
  }),
  chapter_repair: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_repair,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("chapter_repair"),
  }),
  chapter_state_commit: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("chapter_state_commit"),
  }),
  payoff_ledger_sync: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("payoff_ledger_sync"),
    promptAssets: [{ id: "novel.payoff_ledger.sync", version: "v5" }],
  }),
  character_resource_sync: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("character_resource_sync"),
  }),
  quality_repair: createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.quality_repair,
    stage: "quality_repair",
    adapter: getDirectorExecutionNodeAdapter("quality_repair"),
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
  ...Object.values(DIRECTOR_PLANNING_STEP_MODULES),
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
  { id: DIRECTOR_PLANNING_STEP_IDS.structured_outline, writes: ["chapter_task_sheet"], mayModifyUserContent: true },
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
