import type {
  DirectorAutoExecutionState,
  DirectorCircuitBreakerState,
  DirectorConfirmRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { PipelineJobStatus } from "@ai-novel/shared/types/novel";
import {
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
  recordUsageAnomalySignal,
  withCircuitBreakerState,
} from "../runtime/DirectorCircuitBreakerService";
import { directorAutomationLedgerEventService } from "../runtime/DirectorAutomationLedgerEventService";
import { directorUsageTelemetryQueryService } from "../runtime/DirectorUsageTelemetryQueryService";
import { directorIssueService } from "../issues";
import { loadDirectorIssueTaskContext } from "../issues/DirectorIssueTaskContext";
import {
  directorIssuePolicySchema,
  type DirectorIssueAction,
  type DirectorIssueCode,
} from "@ai-novel/shared/types/directorIssue";

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
    requeueTaskForRecovery(taskId: string, message: string): Promise<unknown>;
  };
  automationLedgerEventService?: AutomationLedgerEventPort;
}

async function applyCircuitBreakerDecision(
  deps: CircuitBreakerWorkflowPort,
  input: Parameters<typeof applyCircuitBreakerStop>[1],
  action: DirectorIssueAction,
): Promise<void> {
  if (action === "auto_retry" || action === "continue_with_warning") {
    await syncAutoExecutionTaskState(deps, {
      ...input,
      autoExecution: withCircuitBreakerState(
        input.autoExecution,
        buildClosedDirectorCircuitBreakerState(input.circuitBreaker),
      ),
      isBackgroundRunning: true,
      resumeStage: input.resumeStage ?? "pipeline",
    });
    return;
  }
  if (action === "pause_for_manual") {
    await deps.workflowService.requeueTaskForRecovery(
      input.taskId,
      input.circuitBreaker.message ?? "自动导演已在安全节点暂停，处理后可继续。",
    );
    await syncAutoExecutionTaskState(deps, {
      ...input,
      autoExecution: withCircuitBreakerState(input.autoExecution, input.circuitBreaker),
      isBackgroundRunning: false,
      resumeStage: input.resumeStage ?? "pipeline",
    });
    return;
  }
  await applyCircuitBreakerStop(deps, input);
}

async function applyCircuitBreakerStop(
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

function issueCodeForCircuitBreaker(
  reason: DirectorCircuitBreakerState["reason"],
): DirectorIssueCode {
  switch (reason) {
    case "auto_repair_exhausted": return "quality.local_repair_failed";
    case "replan_loop": return "quality.replan_loop";
    case "model_unavailable": return "runtime.model_unavailable";
    case "service_unavailable": return "runtime.service_unavailable";
    case "protected_user_content": return "runtime.protected_content";
    case "unrecoverable_data_risk": return "runtime.data_integrity";
    case "usage_anomaly": return "runtime.token_budget_exceeded";
    default: return "runtime.unclassified";
  }
}

export async function stopAutoExecutionForCircuitBreaker(
  deps: CircuitBreakerWorkflowPort,
  input: Parameters<typeof applyCircuitBreakerStop>[1],
): Promise<void> {
  const requestPolicy = input.request.issueGovernanceVersion === 1
    ? directorIssuePolicySchema.safeParse(input.request.issuePolicy)
    : null;
  const governance = requestPolicy?.success
    ? {
      issueGovernanceVersion: 1 as const,
      policy: requestPolicy.data,
      policySource: input.request.issuePolicySource ?? "task_snapshot" as const,
    }
    : await loadDirectorIssueTaskContext(input.taskId).catch(() => null);
  if (!governance) {
    await applyCircuitBreakerStop(deps, input);
    return;
  }
  const failureCount = Math.max(
    input.circuitBreaker.failureCount ?? 0,
    input.circuitBreaker.patchFailureCount ?? 0,
    input.circuitBreaker.replanLoopCount ?? 0,
    input.circuitBreaker.modelFailureCount ?? 0,
    input.circuitBreaker.usageAnomalyCount ?? 0,
    1,
  );
  const issueCode = issueCodeForCircuitBreaker(input.circuitBreaker.reason);
  await directorIssueService.reportIssue({
    issueGovernanceVersion: governance.issueGovernanceVersion,
    taskId: input.taskId,
    novelId: input.novelId,
    issueCode,
    stage: input.circuitBreaker.nodeKey ?? "chapter_execution",
    summary: input.circuitBreaker.message ?? "自动导演安全熔断已触发。",
    evidence: input.circuitBreaker.reason ?? undefined,
    affectedScope: input.circuitBreaker.chapterId
      ? `chapter:${input.circuitBreaker.chapterId}`
      : "book",
    chapterId: input.circuitBreaker.chapterId ?? undefined,
    chapterOrder: input.circuitBreaker.chapterOrder ?? undefined,
    attempt: failureCount,
    hasUsableOutput: issueCode.startsWith("quality."),
    runMode: input.request.runMode,
    fingerprint: [
      "circuit_breaker",
      input.circuitBreaker.reason ?? "unknown",
      input.circuitBreaker.chapterId ?? "book",
      failureCount,
    ].join(":"),
    policy: governance.policy,
    policySource: governance.policySource,
    provider: input.request.provider,
    model: input.request.model,
    temperature: input.request.temperature,
    applyAction: (decision) => applyCircuitBreakerDecision(deps, input, decision.action),
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
  return recordModelFailureSignal({
    previous: input.autoExecution.circuitBreaker,
    reason: input.jobStatus === "failed" ? "service_unavailable" : "model_unavailable",
    message: input.message,
    nodeKey: "chapter_execution_node",
  });
}

export { isDirectorCircuitBreakerOpen, withCircuitBreakerState };
