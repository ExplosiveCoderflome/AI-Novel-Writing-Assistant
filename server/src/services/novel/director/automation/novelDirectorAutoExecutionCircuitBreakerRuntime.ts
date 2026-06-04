import type {
  DirectorAutoExecutionState,
  DirectorCircuitBreakerState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { PipelineJobStatus } from "@ai-novel/shared/types/novel";
import {
  buildDirectorAutoExecutionDeferredQualityState,
  buildDirectorAutoExecutionPausedLabel,
  buildDirectorAutoExecutionPausedSummary,
  buildDirectorAutoExecutionScopeLabelFromState,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";
import {
  syncAutoExecutionTaskState,
  type AutoExecutionCheckpointRuntimeDeps,
  type AutoExecutionResumeStage,
} from "./novelDirectorAutoExecutionCheckpointRuntime";
import {
  buildClosedDirectorCircuitBreakerState,
  isDirectorCircuitBreakerOpen,
  recordChapterUsageBudgetExceededSignal,
  recordModelFailureSignal,
  recordPatchFailureSignal,
  recordReplanLoopSignal,
  recordUsageAnomalySignal,
  withCircuitBreakerState,
} from "../runtime/DirectorCircuitBreakerService";
import {
  buildDirectorQualityLoopBudgetWindow,
  buildDirectorQualityLoopIssueSignature,
  findDirectorQualityLoopBudgetEntry,
  recordDirectorQualityLoopBudgetAttempt,
  resolveDirectorQualityLoopBudgetNextAction,
} from "../runtime/DirectorQualityLoopBudgetLedgerService";
import { directorAutomationLedgerEventService } from "../runtime/DirectorAutomationLedgerEventService";
import { directorUsageTelemetryQueryService } from "../runtime/DirectorUsageTelemetryQueryService";

type AutomationLedgerEventPort = Pick<
  typeof directorAutomationLedgerEventService,
  "recordCircuitBreakerOpened" | "recordEvent"
>;

interface CircuitBreakerWorkflowPort extends AutoExecutionCheckpointRuntimeDeps {
  workflowService: AutoExecutionCheckpointRuntimeDeps["workflowService"] & {
    markTaskFailed(taskId: string, message: string, patch?: {
      stage?: "quality_repair";
      itemKey?: string | null;
      itemLabel?: string;
      checkpointType?: "chapter_batch_ready" | "replan_required";
      checkpointSummary?: string | null;
      chapterId?: string | null;
      progress?: number;
    }): Promise<unknown>;
  };
  automationLedgerEventService?: AutomationLedgerEventPort;
}

interface ReplanNoticeRuntimePort extends CircuitBreakerWorkflowPort {
  replanNovel?: (novelId: string, input: {
    chapterId?: string;
    triggerType?: string;
    reason: string;
    sourceIssueIds?: string[];
    windowSize?: number;
    provider?: DirectorConfirmRequest["provider"];
    model?: string;
    temperature?: number;
  }) => Promise<unknown>;
}

export async function stopAutoExecutionForCircuitBreaker(
  deps: CircuitBreakerWorkflowPort,
  input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    range: DirectorAutoExecutionRange;
    autoExecution: DirectorAutoExecutionState;
    circuitBreaker: DirectorCircuitBreakerState;
    resumeStage?: AutoExecutionResumeStage;
  },
): Promise<void> {
  const ledgerEventService = deps.automationLedgerEventService ?? directorAutomationLedgerEventService;
  const autoExecution = withCircuitBreakerState(input.autoExecution, input.circuitBreaker);
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(autoExecution, input.range.totalChapterCount);
  const message = input.circuitBreaker.message?.trim()
    || `${scopeLabel}已暂停，等待处理后再继续。`;
  await ledgerEventService.recordCircuitBreakerOpened({
    taskId: input.taskId,
    novelId: input.novelId,
    state: input.circuitBreaker,
  }).catch(() => null);
  await deps.workflowService.markTaskFailed(input.taskId, message, {
    stage: "quality_repair",
    itemKey: "quality_repair",
    itemLabel: buildDirectorAutoExecutionPausedLabel(autoExecution),
    checkpointType: input.circuitBreaker.reason === "replan_loop" ? "replan_required" : "chapter_batch_ready",
    checkpointSummary: buildDirectorAutoExecutionPausedSummary({
      scopeLabel,
      remainingChapterCount: autoExecution.remainingChapterCount ?? 0,
      nextChapterOrder: autoExecution.nextChapterOrder ?? null,
      failureMessage: message,
    }),
    chapterId: autoExecution.nextChapterId ?? input.range.firstChapterId,
    progress: 0.98,
  });
  await syncAutoExecutionTaskState(deps, {
    taskId: input.taskId,
    novelId: input.novelId,
    request: input.request,
    range: input.range,
    autoExecution,
    isBackgroundRunning: false,
    resumeStage: input.resumeStage ?? "pipeline",
  });
}

export async function resolveUsageCircuitBreaker(input: {
  taskId: string;
  novelId: string;
  autoExecution: DirectorAutoExecutionState;
}): Promise<DirectorCircuitBreakerState | null> {
  const largestChapterUsage = await directorUsageTelemetryQueryService.getLargestChapterUsage({
    novelId: input.novelId,
    taskIds: [input.taskId],
  }).catch(() => null);
  const activeBudgetChapterIds = new Set([
    input.autoExecution.nextChapterId,
    ...(input.autoExecution.remainingChapterIds ?? []),
  ].filter((chapterId): chapterId is string => Boolean(chapterId?.trim())));
  const shouldOpenChapterBudgetBreaker = largestChapterUsage
    ? activeBudgetChapterIds.size === 0 || activeBudgetChapterIds.has(largestChapterUsage.chapterId)
    : false;
  const chapterBudgetBreaker = largestChapterUsage && shouldOpenChapterBudgetBreaker
    ? recordChapterUsageBudgetExceededSignal({
      previous: input.autoExecution.circuitBreaker,
      usageRecordId: largestChapterUsage.latestUsageRecordId,
      totalTokens: largestChapterUsage.totalTokens,
      chapterId: largestChapterUsage.chapterId,
      chapterOrder: input.autoExecution.nextChapterId === largestChapterUsage.chapterId
        ? input.autoExecution.nextChapterOrder
        : null,
      nodeKey: largestChapterUsage.nodeKey ?? "chapter_execution_node",
    })
    : null;
  if (chapterBudgetBreaker) {
    return chapterBudgetBreaker;
  }

  const usage = await directorUsageTelemetryQueryService.getBookUsage({
    novelId: input.novelId,
    taskIds: [input.taskId],
  }).catch(() => null);
  const largestRecentUsage = usage?.recentUsage
    .slice()
    .sort((left, right) => right.totalTokens - left.totalTokens)[0] ?? null;
  if (!largestRecentUsage) {
    return null;
  }
  return recordUsageAnomalySignal({
    previous: input.autoExecution.circuitBreaker,
    usageRecordId: largestRecentUsage.id,
    totalTokens: largestRecentUsage.totalTokens,
    nodeKey: largestRecentUsage.nodeKey,
  });
}

export function buildFailureCircuitBreaker(input: {
  autoExecution: DirectorAutoExecutionState;
  jobStatus: PipelineJobStatus;
  message: string;
}): DirectorCircuitBreakerState {
  if (input.jobStatus === "cancelled") {
    return buildClosedDirectorCircuitBreakerState(input.autoExecution.circuitBreaker);
  }
  if (input.autoExecution.autoRepair) {
    return recordPatchFailureSignal({
      previous: input.autoExecution.circuitBreaker,
      chapterId: input.autoExecution.nextChapterId,
      chapterOrder: input.autoExecution.nextChapterOrder,
      message: input.message,
    });
  }
  return recordModelFailureSignal({
    previous: input.autoExecution.circuitBreaker,
    reason: input.jobStatus === "failed" ? "service_unavailable" : "model_unavailable",
    message: input.message,
    nodeKey: "chapter_execution_node",
  });
}

export async function runFullBookAutopilotReplanNotice(input: {
  deps: ReplanNoticeRuntimePort;
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  range: DirectorAutoExecutionRange;
  autoExecution: DirectorAutoExecutionState;
  checkpointState: DirectorAutoExecutionState;
  noticeSummary: string;
}): Promise<
  | { stopped: true }
  | {
    stopped: false;
    circuitBreaker: DirectorCircuitBreakerState;
    autoExecution?: DirectorAutoExecutionState;
    decision?: "auto_replan_window" | "defer_and_continue";
  }
> {
  const affectedChapterWindow = buildDirectorQualityLoopBudgetWindow({
    autoExecution: input.autoExecution,
    chapterId: input.autoExecution.nextChapterId,
    chapterOrder: input.autoExecution.nextChapterOrder,
  });
  const issueSignature = buildDirectorQualityLoopIssueSignature({
    reason: input.noticeSummary,
    noticeCode: input.checkpointState.qualityRepairRisk?.noticeCode,
    riskLevel: input.checkpointState.qualityRepairRisk?.riskLevel,
    repairMode: input.checkpointState.qualityRepairRisk?.repairMode,
  });
  const existingBudgetEntry = findDirectorQualityLoopBudgetEntry({
    state: input.autoExecution,
    novelId: input.novelId,
    taskId: input.taskId,
    issueSignature,
    affectedChapterWindow,
  });
  const nextBudgetAction = resolveDirectorQualityLoopBudgetNextAction(existingBudgetEntry);
  if (nextBudgetAction === "defer_and_continue") {
    const budgetResult = recordDirectorQualityLoopBudgetAttempt({
      state: input.checkpointState,
      novelId: input.novelId,
      taskId: input.taskId,
      issueSignature,
      affectedChapterWindow,
      action: "defer_and_continue",
      reason: input.noticeSummary,
      chapterId: input.autoExecution.nextChapterId,
      chapterOrder: input.autoExecution.nextChapterOrder,
    });
    const ledgerEventService = input.deps.automationLedgerEventService ?? directorAutomationLedgerEventService;
    const closedCircuitBreaker = buildClosedDirectorCircuitBreakerState(input.autoExecution.circuitBreaker);
    const deferredState = buildDirectorAutoExecutionDeferredQualityState({
      state: withCircuitBreakerState(budgetResult.state, closedCircuitBreaker),
      reason: input.noticeSummary,
      source: "replan_loop",
    });
    await ledgerEventService.recordEvent({
      type: "continue_with_risk",
      idempotencyKey: [
        input.taskId,
        input.novelId,
        budgetResult.entry.signatureKey,
        budgetResult.entry.deferredCount,
      ].join(":"),
      taskId: input.taskId,
      novelId: input.novelId,
      nodeKey: "planner.replan",
      summary: "全书自动成书已暂存重复重规划问题，并继续推进后续章节。",
      affectedScope: input.autoExecution.nextChapterId
        ? `chapter:${input.autoExecution.nextChapterId}`
        : (typeof input.autoExecution.nextChapterOrder === "number" ? `chapter_order:${input.autoExecution.nextChapterOrder}` : null),
      severity: "medium",
      metadata: {
        decision: "defer_and_continue",
        noticeSummary: input.noticeSummary,
        chapterOrder: input.autoExecution.nextChapterOrder ?? null,
        qualityBudgetEntry: budgetResult.entry,
      },
    }).catch(() => null);
    return {
      stopped: false,
      circuitBreaker: closedCircuitBreaker,
      autoExecution: deferredState,
      decision: "defer_and_continue",
    };
  }
  const budgetResult = recordDirectorQualityLoopBudgetAttempt({
    state: input.checkpointState,
    novelId: input.novelId,
    taskId: input.taskId,
    issueSignature,
    affectedChapterWindow,
    action: "window_replan",
    reason: input.noticeSummary,
    chapterId: input.autoExecution.nextChapterId,
    chapterOrder: input.autoExecution.nextChapterOrder,
  });
  const replanCircuitBreaker = recordReplanLoopSignal({
    previous: budgetResult.state.circuitBreaker,
    chapterId: input.autoExecution.nextChapterId,
    chapterOrder: input.autoExecution.nextChapterOrder,
    message: input.noticeSummary,
  });
  if (isDirectorCircuitBreakerOpen(replanCircuitBreaker)) {
    const ledgerEventService = input.deps.automationLedgerEventService ?? directorAutomationLedgerEventService;
    const closedCircuitBreaker = buildClosedDirectorCircuitBreakerState(replanCircuitBreaker);
    const deferredState = buildDirectorAutoExecutionDeferredQualityState({
      state: withCircuitBreakerState(budgetResult.state, closedCircuitBreaker),
      reason: input.noticeSummary,
      source: "replan_loop",
    });
    await ledgerEventService.recordEvent({
      type: "continue_with_risk",
      idempotencyKey: [
        input.taskId,
        input.novelId,
        deferredState.nextChapterId ?? input.autoExecution.nextChapterId ?? "unknown",
        deferredState.nextChapterOrder ?? input.autoExecution.nextChapterOrder ?? "unknown",
        replanCircuitBreaker.replanLoopCount ?? "replan",
      ].join(":"),
      taskId: input.taskId,
      novelId: input.novelId,
      nodeKey: "planner.replan",
      summary: "全书自动成书已暂存重复重规划问题，并继续推进后续章节。",
      affectedScope: input.autoExecution.nextChapterId
        ? `chapter:${input.autoExecution.nextChapterId}`
        : (typeof input.autoExecution.nextChapterOrder === "number" ? `chapter_order:${input.autoExecution.nextChapterOrder}` : null),
      severity: "medium",
      metadata: {
        decision: "defer_and_continue",
        circuitBreaker: replanCircuitBreaker,
        noticeSummary: input.noticeSummary,
        chapterOrder: input.autoExecution.nextChapterOrder ?? null,
        qualityBudgetEntry: budgetResult.entry,
      },
    }).catch(() => null);
    return {
      stopped: false,
      circuitBreaker: closedCircuitBreaker,
      autoExecution: deferredState,
      decision: "defer_and_continue",
    };
  }
  if (input.deps.replanNovel) {
    try {
      await input.deps.replanNovel(input.novelId, {
        chapterId: input.autoExecution.nextChapterId ?? undefined,
        triggerType: "audit_failure",
        reason: input.noticeSummary,
        provider: input.request.provider,
        model: input.request.model,
        temperature: input.request.temperature,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const replanFailureBreaker = recordModelFailureSignal({
        previous: replanCircuitBreaker,
        reason: "service_unavailable",
        message,
        nodeKey: "planner.replan",
      });
      if (isDirectorCircuitBreakerOpen(replanFailureBreaker)) {
        await stopAutoExecutionForCircuitBreaker(input.deps, {
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range: input.range,
          autoExecution: withCircuitBreakerState(budgetResult.state, replanFailureBreaker),
          circuitBreaker: replanFailureBreaker,
          resumeStage: "pipeline",
        });
        return { stopped: true };
      }
      throw error;
    }
  }
  return {
    stopped: false,
    circuitBreaker: replanCircuitBreaker,
    autoExecution: withCircuitBreakerState(budgetResult.state, replanCircuitBreaker),
    decision: "auto_replan_window",
  };
}

export { isDirectorCircuitBreakerOpen, withCircuitBreakerState };
