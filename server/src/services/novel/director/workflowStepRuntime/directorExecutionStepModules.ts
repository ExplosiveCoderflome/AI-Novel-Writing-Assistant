import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import { isDirectorAutoExecutionRunMode } from "@ai-novel/shared/types/novelDirector";
import {
  getWorkflowStepCatalogEntry,
} from "@ai-novel/shared/types/directorWorkflowStepCatalog";
import {
  getDirectorExecutionNodeAdapter,
  type DirectorExecutionStage,
} from "../novelDirectorExecutionNodeAdapters";
import {
  hasDirectorSyncedChapterExecutionContext,
} from "../automation/novelDirectorAutoExecution";
import {
  createWorkflowStepDescriptorFromCatalogEntry,
  createWorkflowStepDescriptorFromDirectorAdapter,
  createWorkflowStepModule,
  type WorkflowStepExecutionContext,
  type WorkflowStepModule,
  type WorkflowStepModuleDescriptor,
  type WorkflowStepProgress,
} from "./WorkflowStepModule";
import {
  blockedState,
  buildSimpleProgress,
  completedFact,
  getActiveArtifactsFromContext,
  getDirectorCoreStateReader,
  getDirectorCoreStateCommitter,
  getDirectorCoreStepRuntime,
  loadDirectorModuleState,
  loadFactBaseSummary,
  pendingFact,
  readyState,
  requireDirectorRequest,
  resolveChapterExecutionProgressScope,
  scopeChapterExecutionProgress,
} from "./directorWorkflowStepShared";
import {
  DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_ID,
  DIRECTOR_EXECUTION_STEP_IDS,
} from "./directorWorkflowStepIds";

function createChapterDraftExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  existingPipelineJobId?: string | null;
  existingState?: DirectorAutoExecutionState | null;
  resumeCheckpointType?: "chapter_batch_ready" | "replan_required" | null;
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
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const chapterProgress = scopeChapterExecutionProgress(
          state.chapterProgress ?? await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId),
          resolveChapterExecutionProgressScope({ state, request }),
        );
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
        const directorRequest = requireDirectorRequest(request);
        const requestedAutoExecutionContinue = state.task.status === "failed" || state.task.status === "cancelled";
        return {
          taskId: state.task.id,
          novelId,
          request: directorRequest,
          existingPipelineJobId: state.seedPayload.autoExecution?.pipelineJobId ?? null,
          existingState: state.seedPayload.autoExecution ?? null,
          resumeCheckpointType: (
            state.task.checkpointType === "chapter_batch_ready"
            || state.task.checkpointType === "replan_required"
          )
            ? state.task.checkpointType
            : "chapter_batch_ready",
          previousFailureMessage: state.task.lastError ?? null,
          allowSkipReviewBlockedChapter: requestedAutoExecutionContinue && isDirectorAutoExecutionRunMode(directorRequest.runMode),
        };
      },
      validateOutput: async (_output, context) => {
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const freshState = context.taskId
          ? await getDirectorCoreStateReader().readByTaskId(context.taskId).catch(() => null)
          : null;
        const observedState = freshState ?? state;
        if (observedState.task.status === "failed" || observedState.task.status === "cancelled") {
          const reason = observedState.task.lastError?.trim()
            || observedState.task.checkpointSummary?.trim()
            || "Chapter execution stopped before completing the draft step.";
          return {
            valid: false,
            reason,
          };
        }
        const progress = scopeChapterExecutionProgress(
          observedState.chapterProgress ?? await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId),
          resolveChapterExecutionProgressScope({ state: observedState, request }),
        );
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
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const progress = scopeChapterExecutionProgress(
          state.chapterProgress ?? await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId),
          resolveChapterExecutionProgressScope({ state, request }),
        );
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
          label: progress.activeChapterOrder
            ? `\u6b63\u5728\u63a8\u8fdb\u7b2c ${progress.activeChapterOrder} \u7ae0`
            : progress.currentChapterOrder
              ? `\u5f53\u524d\u53ef\u4ece\u7b2c ${progress.currentChapterOrder} \u7ae0\u7ee7\u7eed\u8865\u9f50`
              : "\u6b63\u5728\u63a8\u8fdb\u7ae0\u8282\u6267\u884c",
          evidence: {
            activeChapterOrder: progress.activeChapterOrder,
            currentChapterOrder: progress.currentChapterOrder,
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
        const { novelId, state, request } = await loadDirectorModuleState(context);
        const progress = scopeChapterExecutionProgress(
          state.chapterProgress ?? await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId),
          resolveChapterExecutionProgressScope({ state, request }),
        );
        const resumeChapterOrder = progress?.activeChapterOrder ?? progress?.currentChapterOrder;
        const resumeFrom = resumeChapterOrder
          ? `chapter:${resumeChapterOrder}`
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
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const progress = scopeChapterExecutionProgress(
          state.chapterProgress ?? await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId),
          resolveChapterExecutionProgressScope({ state, request }),
        );
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
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
        const unsyncedChapterCount = Math.max(0, plannedChapterCount - syncedChapterCount);
        if (plannedChapterCount === 0) {
          return blockedState("Chapter planning must finish before execution-ready chapter records can be checked.", {
            code: "missing_chapter_plan",
            evidence: { plannedChapterCount, syncedChapterCount, unsyncedChapterCount },
            nextAction: "run_chapter_detail_generation",
          });
        }
        return readyState({
          evidence: { plannedChapterCount, syncedChapterCount, unsyncedChapterCount },
          resumeFrom: syncedChapterCount >= plannedChapterCount ? "chapter_execution_contract_sync_done" : "chapter_execution_contract_sync",
        });
      },
      inspectCompletion: async (context) => {
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
        const unsyncedChapterCount = Math.max(0, plannedChapterCount - syncedChapterCount);
        return plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount
          ? completedFact(descriptor.id, { evidence: { plannedChapterCount, syncedChapterCount, unsyncedChapterCount } })
          : pendingFact(descriptor.id, {
            ratio: plannedChapterCount > 0 ? Math.min(1, syncedChapterCount / plannedChapterCount) : 0,
            evidence: { plannedChapterCount, syncedChapterCount, unsyncedChapterCount },
          });
      },
      buildInput: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return { novelId };
      },
      validateOutput: async (_output, context) => {
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
        return {
          valid: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount,
          reason: "Execution-ready chapter records are not complete yet.",
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
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
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
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
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

export const DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE = createChapterExecutionContractSyncModule({
  ...createWorkflowStepDescriptorFromCatalogEntry({
    entry: getWorkflowStepCatalogEntry(DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_ID),
  }),
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
      const summary = await loadFactBaseSummary(context);
      const draftedCount = summary.repair.draftedChapterCount;
      const reviewedCount = summary.repair.reviewedChapterCount;
      const drafted = { length: draftedCount };
      const reviewed = reviewedCount;
      return {
        readiness: draftedCount > 0
          ? readyState({ evidence: { draftedChapterCount: draftedCount, reviewedChapterCount: reviewedCount } })
          : blockedState("Draft chapters are required before quality review.", {
            code: "missing_chapter_drafts",
            nextAction: "continue_chapter_execution",
          }),
        completion: draftedCount > 0 && reviewedCount >= draftedCount
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review, { evidence: { draftedChapterCount: draftedCount, reviewedChapterCount: reviewedCount } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review, {
            ratio: draftedCount > 0 ? reviewedCount / draftedCount : 0,
            evidence: { draftedChapterCount: draftedCount, reviewedChapterCount: reviewedCount },
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
      const summary = await loadFactBaseSummary(context);
      const draftedChapterCount = summary.repair.draftedChapterCount;
      const reviewedChapterCount = summary.repair.reviewedChapterCount;
      const needsRepairChapters = summary.repair.needsRepairChapterCount;
      const hasRepairContext = reviewedChapterCount > 0 || needsRepairChapters > 0;
      const progress = {
        needsRepairChapters: hasRepairContext ? needsRepairChapters : 1,
        totalChapters: Math.max(draftedChapterCount, 1),
      };
      return {
        readiness: draftedChapterCount === 0
          ? blockedState("Draft chapters are required before chapter repair.", {
            code: "missing_chapter_drafts",
            nextAction: "continue_chapter_execution",
          })
          : hasRepairContext
            ? readyState({ evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters } })
            : blockedState("Quality review facts must exist before chapter repair.", {
              code: "missing_quality_review_facts",
              evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters },
              nextAction: "run_quality_review",
            }),
        completion: hasRepairContext && needsRepairChapters === 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, { evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters: 0 } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, {
            ratio: hasRepairContext ? Math.max(0, 1 - (needsRepairChapters / Math.max(draftedChapterCount, 1))) : 0,
            evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters, totalChapters: draftedChapterCount },
          }),
        progress: buildSimpleProgress({
          status: draftedChapterCount === 0 ? "blocked" : hasRepairContext ? ((progress?.needsRepairChapters ?? 0) === 0 ? "completed" : "needs_review") : "not_started",
          ratio: hasRepairContext ? Math.max(0, 1 - (needsRepairChapters / Math.max(draftedChapterCount, 1))) : 0,
          label: (progress?.needsRepairChapters ?? 0) === 0 ? "章节修复已收敛" : "仍有章节处于待修复状态",
          evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters },
          nextAction: draftedChapterCount === 0 ? "continue_chapter_execution" : hasRepairContext ? ((progress?.needsRepairChapters ?? 0) === 0 ? "run_quality_review" : "repair_chapter") : "run_quality_review",
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
      const summary = await loadFactBaseSummary(context);
      const draftedCount = summary.repair.draftedChapterCount;
      const committedCount = summary.repair.committedChapterCount;
      const drafted = { length: draftedCount };
      const committed = committedCount;
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
      const activeArtifacts = getActiveArtifactsFromContext(context, ["reader_promise", "repair_ticket"]);
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
      const activeArtifacts = getActiveArtifactsFromContext(context, ["character_governance_state", "continuity_state"]);
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
      const summary = await loadFactBaseSummary(context);
      const draftedChapterCount = summary.repair.draftedChapterCount;
      const reviewedChapterCount = summary.repair.reviewedChapterCount;
      const needsRepairChapters = summary.repair.needsRepairChapterCount;
      const hasRepairContext = reviewedChapterCount > 0 || needsRepairChapters > 0;
      const progress = {
        needsRepairChapters: hasRepairContext ? needsRepairChapters : 1,
        totalChapters: Math.max(draftedChapterCount, 1),
      };
      return {
        readiness: draftedChapterCount === 0
          ? blockedState("Draft chapters are required before quality repair.", {
            code: "missing_chapter_drafts",
            nextAction: "continue_chapter_execution",
          })
          : hasRepairContext
            ? readyState({ evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters } })
            : blockedState("Quality review facts must exist before quality repair.", {
              code: "missing_quality_review_facts",
              evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters },
              nextAction: "run_quality_review",
            }),
        completion: hasRepairContext && needsRepairChapters === 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.quality_repair, { evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters: 0 } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.quality_repair, {
            ratio: hasRepairContext ? Math.max(0, 1 - (needsRepairChapters / Math.max(draftedChapterCount, 1))) : 0,
            evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters, totalChapters: draftedChapterCount },
          }),
        progress: buildSimpleProgress({
          status: draftedChapterCount === 0 ? "blocked" : hasRepairContext ? ((progress?.needsRepairChapters ?? 0) === 0 ? "completed" : "needs_review") : "not_started",
          ratio: hasRepairContext ? Math.max(0, 1 - (needsRepairChapters / Math.max(draftedChapterCount, 1))) : 0,
          label: (progress?.needsRepairChapters ?? 0) === 0 ? "质量修复链已收敛" : "仍有章节等待质量修复",
          evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters },
          nextAction: draftedChapterCount === 0 ? "continue_chapter_execution" : hasRepairContext ? ((progress?.needsRepairChapters ?? 0) === 0 ? "continue_chapter_execution" : "repair_chapter") : "run_quality_review",
        }),
      };
    },
  }),
};
