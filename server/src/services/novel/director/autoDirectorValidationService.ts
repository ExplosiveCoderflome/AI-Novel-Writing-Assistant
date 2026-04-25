import type {
  AutoDirectorActionValidationInput,
  AutoDirectorAffectedScope,
  AutoDirectorFollowUpSection,
  AutoDirectorFollowUpSectionInput,
  AutoDirectorTakeoverValidationInput,
  AutoDirectorValidationResult,
  AutoDirectorValidationRequiredAction,
} from "@ai-novel/shared/types/autoDirectorValidation";
import {
  AUTO_DIRECTOR_TAKEOVER_ENTRY_ORDER,
} from "@ai-novel/shared/types/autoDirectorValidation";
import type {
  DirectorAutoExecutionPlan,
  DirectorTakeoverEntryStep,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";

const WEB_SOURCES = new Set(["web", "follow_up_action", "batch_action", "takeover", "continue", "retry"]);
const CHANNEL_SOURCES = new Set(["dingtalk", "wecom", "channel_callback"]);
const AUTO_DIRECTOR_FOLLOW_UP_SECTION_RANK: Record<AutoDirectorFollowUpSection, number> = {
  needs_validation: 0,
  exception: 1,
  pending: 2,
  auto_progress: 3,
  replaced: 4,
};

function requiredAction(input: AutoDirectorValidationRequiredAction): AutoDirectorValidationRequiredAction {
  return input;
}

function normalizeChapterOrder(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : null;
}

function resolveScopeFromPlan(plan: DirectorAutoExecutionPlan | null | undefined): AutoDirectorAffectedScope {
  if (plan?.mode === "book") {
    return {
      type: "book",
      label: "全书",
    };
  }
  if (plan?.mode === "chapter_range") {
    const startOrder = normalizeChapterOrder(plan.startOrder) ?? 1;
    const endOrder = Math.max(startOrder, normalizeChapterOrder(plan.endOrder) ?? startOrder);
    return {
      type: "chapter_range",
      label: startOrder === endOrder ? `第 ${startOrder} 章` : `第 ${startOrder}-${endOrder} 章`,
      startOrder,
      endOrder,
    };
  }
  if (plan?.mode === "volume") {
    const volumeOrder = normalizeChapterOrder(plan.volumeOrder) ?? 1;
    return {
      type: "volume",
      label: `第 ${volumeOrder} 卷`,
      volumeOrder,
    };
  }
  if (plan?.mode === "front10") {
    const endOrder = Math.max(1, normalizeChapterOrder(plan.endOrder) ?? 10);
    return {
      type: "chapter_range",
      label: `前 ${endOrder} 章`,
      startOrder: 1,
      endOrder,
    };
  }
  return {
    type: "book",
    label: "全书",
  };
}

function resolveScopeFromTask(input: AutoDirectorActionValidationInput): AutoDirectorAffectedScope {
  const autoExecution = input.task.seedPayload?.autoExecution;
  const startOrder = normalizeChapterOrder(autoExecution?.startOrder);
  const endOrder = normalizeChapterOrder(autoExecution?.endOrder);
  if (startOrder && endOrder) {
    return {
      type: "chapter_range",
      label: autoExecution?.scopeLabel?.trim() || (startOrder === endOrder ? `第 ${startOrder} 章` : `第 ${startOrder}-${endOrder} 章`),
      startOrder,
      endOrder: Math.max(startOrder, endOrder),
    };
  }
  const volumeOrder = normalizeChapterOrder(autoExecution?.volumeOrder);
  if (volumeOrder) {
    return {
      type: "volume",
      label: autoExecution?.scopeLabel?.trim() || `第 ${volumeOrder} 卷`,
      volumeOrder,
    };
  }
  return {
    type: "book",
    label: autoExecution?.scopeLabel?.trim() || "全书",
  };
}

function buildResult(input: {
  allowed: boolean;
  affectedScope: AutoDirectorAffectedScope;
  blockingReasons?: string[];
  warnings?: string[];
  requiredActions?: AutoDirectorValidationRequiredAction[];
  nextCheckpoint?: NovelWorkflowCheckpoint | null;
  nextAction?: string | null;
}): AutoDirectorValidationResult {
  return {
    allowed: input.allowed,
    blockingReasons: input.blockingReasons ?? [],
    warnings: input.warnings ?? [],
    requiredActions: input.requiredActions ?? [],
    affectedScope: input.affectedScope,
    nextCheckpoint: input.nextCheckpoint ?? null,
    nextAction: input.nextAction ?? (input.allowed ? "continue" : "blocked"),
  };
}

function isEntryAtOrAfter(entryStep: DirectorTakeoverEntryStep, minimum: DirectorTakeoverEntryStep): boolean {
  return AUTO_DIRECTOR_TAKEOVER_ENTRY_ORDER[entryStep] >= AUTO_DIRECTOR_TAKEOVER_ENTRY_ORDER[minimum];
}

function validateScopeAgainstAssets(input: {
  affectedScope: AutoDirectorAffectedScope;
  assets: AutoDirectorTakeoverValidationInput["assets"];
  entryStep: DirectorTakeoverEntryStep;
}): string[] {
  const reasons: string[] = [];
  const totalChapterCount = normalizeChapterOrder(input.assets.totalChapterCount ?? null);
  if (input.affectedScope.type === "chapter_range" && totalChapterCount && input.affectedScope.endOrder > totalChapterCount) {
    reasons.push(`目标章节范围超过当前全书规划章节数，请把范围调整到 ${totalChapterCount} 章以内。`);
  }
  if (input.affectedScope.type === "volume") {
    const volumeCount = normalizeChapterOrder(input.assets.volumeCount) ?? 0;
    if (volumeCount > 0 && input.affectedScope.volumeOrder > volumeCount) {
      reasons.push(`当前卷战略只有 ${volumeCount} 卷，不能直接执行第 ${input.affectedScope.volumeOrder} 卷。`);
    }
  }
  if (input.affectedScope.type === "chapter_range" && !isEntryAtOrAfter(input.entryStep, "structured")) {
    reasons.push("章节范围只能从节奏拆章、章节执行或质量修复开始。");
  }
  if (input.affectedScope.type === "volume" && !isEntryAtOrAfter(input.entryStep, "outline")) {
    reasons.push("卷范围只能从卷战略、节奏拆章、章节执行或质量修复开始。");
  }
  if (isEntryAtOrAfter(input.entryStep, "structured") && !input.assets.hasVolumeStrategyPlan) {
    reasons.push("目标范围缺少卷战略支撑，需要先完成卷战略。");
  }
  if (isEntryAtOrAfter(input.entryStep, "chapter") && !input.assets.hasStructuredOutline) {
    reasons.push("目标范围缺少节奏拆章，需要先完成或重新校验拆章结果。");
  }
  return reasons;
}

export function validateAutoDirectorTakeoverRequest(
  input: AutoDirectorTakeoverValidationInput,
): AutoDirectorValidationResult {
  const entryStep = input.request.entryStep ?? "basic";
  const affectedScope = resolveScopeFromPlan(input.request.autoExecutionPlan);
  const blockingReasons: string[] = [];

  if (entryStep === "story_macro" && !input.assets.hasProjectSetup) {
    blockingReasons.push("项目设定不完整，不能直接从故事宏观规划开始。");
  }
  if (isEntryAtOrAfter(entryStep, "character") && !input.assets.hasStoryMacroPlan) {
    blockingReasons.push("故事宏观规划尚未完成，不能直接进入角色准备。");
  }
  if (isEntryAtOrAfter(entryStep, "outline") && (!input.assets.hasStoryMacroPlan || (input.assets.characterCount ?? 0) <= 0)) {
    blockingReasons.push("角色准备尚未完成，不能直接进入卷战略。");
  }
  blockingReasons.push(...validateScopeAgainstAssets({
    affectedScope,
    assets: input.assets,
    entryStep,
  }));

  return buildResult({
    allowed: blockingReasons.length === 0,
    blockingReasons,
    affectedScope,
    warnings: input.request.strategy === "restart_current_step"
      ? ["重新生成会影响目标节点及后续资产，执行前需要保留可恢复快照。"]
      : [],
    requiredActions: input.request.strategy === "restart_current_step"
      ? [
          requiredAction({
            code: "create_rewrite_snapshot",
            label: "创建重写前快照",
            riskLevel: "high",
            safeToAutoFix: false,
          }),
          requiredAction({
            code: "reset_downstream_state",
            label: "重置目标节点后的状态",
            riskLevel: "medium",
            safeToAutoFix: false,
          }),
        ]
      : [],
    nextCheckpoint: "front10_ready",
    nextAction: blockingReasons.length > 0
      ? "blocked"
      : entryStep === "chapter" || entryStep === "pipeline"
        ? "continue_auto_execution"
        : "continue_structured_outline",
  });
}

export function validateAutoDirectorAction(input: AutoDirectorActionValidationInput): AutoDirectorValidationResult {
  const affectedScope = resolveScopeFromTask(input);
  const blockingReasons: string[] = [];

  if (input.task.lane && input.task.lane !== "auto_director") {
    blockingReasons.push("当前任务不是自动导演任务，不能使用自动导演动作。");
  }
  if (input.task.pendingManualRecovery && input.actionCode !== "continue_generic") {
    blockingReasons.push("任务处于人工恢复状态，请先恢复任务再继续其他操作。");
  }
  if (CHANNEL_SOURCES.has(input.source) && input.actionCode !== "continue_auto_execution" && input.actionCode !== "retry_with_task_model") {
    blockingReasons.push("消息端只支持低风险动作，请回到站内确认后继续。");
  }
  if (CHANNEL_SOURCES.has(input.source) && input.actionCode === "retry_with_route_model") {
    blockingReasons.push("按路由模型重试需要站内确认，请打开跟进中心处理。");
  }
  if (input.actionCode === "continue_auto_execution" && input.task.status !== "waiting_approval") {
    blockingReasons.push("当前任务不在等待继续状态，请先重新校验任务状态。");
  }
  if (input.actionCode === "continue_auto_execution" && input.task.checkpointType !== "front10_ready" && input.task.checkpointType !== "chapter_batch_ready") {
    blockingReasons.push("当前检查点不能直接继续章节执行，请先查看任务详情。");
  }
  if ((input.actionCode === "retry_with_task_model" || input.actionCode === "retry_with_route_model") && input.task.status !== "failed" && input.task.status !== "cancelled") {
    blockingReasons.push("当前任务没有失败或取消，不需要重试。");
  }

  return buildResult({
    allowed: blockingReasons.length === 0,
    blockingReasons,
    affectedScope,
    warnings: input.actionCode === "retry_with_route_model"
      ? ["按路由模型重试会使用当前模型路由，结果可能与任务原模型不同。"]
      : [],
    requiredActions: input.actionCode === "continue_auto_execution"
      ? [
          requiredAction({
            code: "clear_checkpoint",
            label: "清除已处理检查点",
            riskLevel: "low",
            safeToAutoFix: true,
          }),
        ]
      : input.actionCode === "retry_with_task_model" || input.actionCode === "retry_with_route_model"
        ? [
            requiredAction({
              code: "clear_failure",
              label: "清除失败状态并重新执行",
              riskLevel: "low",
              safeToAutoFix: true,
            }),
          ]
        : [],
    nextAction: blockingReasons.length > 0
      ? (WEB_SOURCES.has(input.source) ? "revalidate" : "open_follow_up_center")
      : input.actionCode,
  });
}

export function resolveAutoDirectorFollowUpSection(input: AutoDirectorFollowUpSectionInput): AutoDirectorFollowUpSection {
  if (input.validationResult && !input.validationResult.allowed) {
    return "needs_validation";
  }
  if (input.pendingManualRecovery || input.status === "failed" || input.status === "cancelled") {
    return "exception";
  }
  if (input.status === "waiting_approval") {
    return "pending";
  }
  if (input.status === "queued" || input.status === "running") {
    return "auto_progress";
  }
  if (input.replacementTaskId?.trim()) {
    return "replaced";
  }
  return "pending";
}

export function compareAutoDirectorFollowUpSections(
  left: AutoDirectorFollowUpSection,
  right: AutoDirectorFollowUpSection,
): number {
  return AUTO_DIRECTOR_FOLLOW_UP_SECTION_RANK[left] - AUTO_DIRECTOR_FOLLOW_UP_SECTION_RANK[right];
}

export class AutoDirectorValidationService {
  validateTakeoverRequest(input: AutoDirectorTakeoverValidationInput): AutoDirectorValidationResult {
    return validateAutoDirectorTakeoverRequest(input);
  }

  validateAction(input: AutoDirectorActionValidationInput): AutoDirectorValidationResult {
    return validateAutoDirectorAction(input);
  }

  resolveFollowUpSection(input: AutoDirectorFollowUpSectionInput): AutoDirectorFollowUpSection {
    return resolveAutoDirectorFollowUpSection(input);
  }
}
