import { asObject, summarizeOutput } from "../agents/runtime/runtimeHelpers";
import type { AgentRuntimeResult, PlannerResult, StructuredIntent } from "../agents/types";
import type { ProductionStatusResult } from "../services/novel/NovelProductionStatusService";
import type { AgentStep } from "@ai-novel/shared/types/agent";
import type {
  CreativeHubInterrupt,
  CreativeHubThread,
  CreativeHubTurnStatus,
  CreativeHubTurnSummary,
} from "@ai-novel/shared/types/creativeHub";

function truncateText(value: string, max = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function formatIntentLabel(intent: StructuredIntent["intent"] | undefined): string {
  switch (intent) {
    case "list_novels":
      return "查看小说工作区";
    case "create_novel":
      return "创建新小说";
    case "select_novel_workspace":
      return "切换当前工作区";
    case "unbind_world_from_novel":
      return "解除当前世界观绑定";
    case "produce_novel":
      return "推进整本创作";
    case "query_novel_production_status":
      return "查看整本生产进度";
    case "query_chapter_content":
      return "查看章节内容";
    case "inspect_failure_reason":
      return "诊断当前阻塞";
    case "write_chapter":
      return "推进章节创作";
    case "rewrite_chapter":
      return "重写当前章节";
    case "search_knowledge":
      return "查阅知识资料";
    case "ideate_novel_setup":
      return "生成设定备选";
    case "inspect_world":
      return "检查世界观约束";
    case "inspect_characters":
      return "查看角色状态";
    case "general_chat":
      return "创作讨论";
    default:
      return "推进当前创作";
  }
}

function toTurnStatus(
  threadStatus: CreativeHubThread["status"],
  latestError: string | null,
  executionResult: AgentRuntimeResult | null,
): CreativeHubTurnStatus {
  if (latestError || executionResult?.run.status === "failed") {
    return "failed";
  }
  if (threadStatus === "interrupted" || executionResult?.run.status === "waiting_approval") {
    return "interrupted";
  }
  if (executionResult?.run.status === "cancelled") {
    return "cancelled";
  }
  if (executionResult?.run.status === "running" || threadStatus === "busy") {
    return "running";
  }
  return "succeeded";
}

function extractToolSummaries(steps: AgentStep[]): string[] {
  return steps
    .filter((step) => step.stepType === "tool_result" && step.status === "succeeded")
    .map((step) => {
      const input = asObject(step.inputJson);
      const output = asObject(step.outputJson);
      const tool = typeof input.tool === "string" ? input.tool : "";
      if (!tool) {
        return "";
      }
      return truncateText(summarizeOutput(tool, output), 120);
    })
    .filter(Boolean);
}

function shouldEmitTurnSummary(
  turnStatus: CreativeHubTurnStatus,
  latestError: string | null,
  executionResult: AgentRuntimeResult | null,
): boolean {
  if (latestError) {
    return true;
  }
  if (turnStatus !== "succeeded") {
    return true;
  }
  const steps = executionResult?.steps ?? [];
  return steps.some((step) => step.stepType === "tool_result" && step.status === "succeeded");
}

function buildIntentSummary(goal: string, plannerResult: PlannerResult | null): string {
  const structuredIntent = plannerResult?.structuredIntent;
  const describedGoal = truncateText(structuredIntent?.description ?? structuredIntent?.note ?? goal, 150);
  const label = formatIntentLabel(structuredIntent?.intent);
  return describedGoal ? `${label}：${describedGoal}` : label;
}

function buildActionSummary(
  turnStatus: CreativeHubTurnStatus,
  plannerResult: PlannerResult | null,
  toolSummaries: string[],
): string {
  if (toolSummaries.length > 0) {
    const preview = toolSummaries.slice(0, 3).join("；");
    if (toolSummaries.length > 3) {
      return `${preview} 等 ${toolSummaries.length} 项动作。`;
    }
    return preview;
  }
  if ((plannerResult?.actions.length ?? 0) > 0) {
    const count = plannerResult?.actions.reduce((total, action) => total + action.calls.length, 0) ?? 0;
    if (turnStatus === "interrupted") {
      return `已规划 ${count} 项动作，当前停在审批或确认环节。`;
    }
    return `已规划 ${count} 项动作，本轮以创作协同与状态整理为主。`;
  }
  return "本轮未触发显式工具动作，以创作对话与工作区理解为主。";
}

function buildImpactSummary(
  latestError: string | null,
  interrupts: CreativeHubInterrupt[],
  productionStatus?: ProductionStatusResult | null,
  toolSummaries: string[] = [],
): string {
  if (latestError) {
    return truncateText(latestError, 180);
  }
  if (interrupts.length > 0) {
    return truncateText(interrupts[0]?.summary ?? "当前存在待确认的高影响操作。", 180);
  }
  if (productionStatus?.summary?.trim()) {
    return truncateText(productionStatus.summary, 180);
  }
  if (toolSummaries.length > 0) {
    return toolSummaries[toolSummaries.length - 1];
  }
  return "工作区状态已更新，可继续沿当前创作方向推进。";
}

function buildNextSuggestion(
  turnStatus: CreativeHubTurnStatus,
  plannerResult: PlannerResult | null,
  latestError: string | null,
  interrupts: CreativeHubInterrupt[],
  productionStatus?: ProductionStatusResult | null,
): string {
  if (turnStatus === "interrupted" && interrupts.length > 0) {
    return "先处理当前审批卡，再继续推进后续创作。";
  }
  if (turnStatus === "failed" || latestError) {
    return productionStatus?.recoveryHint?.trim()
      || "先查看失败诊断与阻塞原因，再决定继续生成还是调整上下文。";
  }
  switch (plannerResult?.structuredIntent.intent) {
    case "create_novel":
      return "继续补齐世界观、角色或整本生产参数，让这本书进入稳定工作区。";
    case "unbind_world_from_novel":
      return "如果还需要世界观支撑，就重新选择一套更合适的世界观；否则继续补核心设定。";
    case "produce_novel":
      return "继续围绕当前小说推进整本生产，必要时先检查关键阻塞。";
    case "query_novel_production_status":
      return "结合当前进度决定是继续生成、补资源，还是先处理失败点。";
    case "write_chapter":
    case "rewrite_chapter":
      return "继续围绕当前章节推进正文、修复问题或检查上下文一致性。";
    case "search_knowledge":
      return "根据已找到的资料继续追问，或将关键材料绑定到当前工作区。";
    case "ideate_novel_setup":
      return "从当前备选里挑出最接近的一版，再继续细化主角、冲突和故事承诺。";
    default:
      return "继续围绕当前工作区推进下一步创作。";
  }
}

function buildCurrentStage(
  turnStatus: CreativeHubTurnStatus,
  plannerResult: PlannerResult | null,
  executionResult: AgentRuntimeResult | null,
  productionStatus?: ProductionStatusResult | null,
): string {
  if (turnStatus === "interrupted") {
    return "等待审批";
  }
  if (turnStatus === "failed") {
    return "运行失败";
  }
  if (productionStatus?.currentStage?.trim()) {
    return productionStatus.currentStage.trim();
  }
  if (executionResult?.run.currentStep?.trim()) {
    return executionResult.run.currentStep.trim();
  }
  return formatIntentLabel(plannerResult?.structuredIntent.intent);
}

export function buildCreativeHubTurnSummary(input: {
  checkpointId: string;
  goal: string;
  threadStatus: CreativeHubThread["status"];
  latestError: string | null;
  plannerResult: PlannerResult | null;
  executionResult: AgentRuntimeResult | null;
  interrupts: CreativeHubInterrupt[];
  productionStatus?: ProductionStatusResult | null;
}): CreativeHubTurnSummary | null {
  const executionResult = input.executionResult;
  const runId = executionResult?.run.id;
  if (!runId) {
    return null;
  }

  const turnStatus = toTurnStatus(input.threadStatus, input.latestError, executionResult);
  if (!shouldEmitTurnSummary(turnStatus, input.latestError, executionResult)) {
    return null;
  }
  const toolSummaries = extractToolSummaries(executionResult.steps);

  return {
    runId,
    checkpointId: input.checkpointId,
    status: turnStatus,
    currentStage: buildCurrentStage(turnStatus, input.plannerResult, executionResult, input.productionStatus),
    intentSummary: buildIntentSummary(input.goal, input.plannerResult),
    actionSummary: buildActionSummary(turnStatus, input.plannerResult, toolSummaries),
    impactSummary: buildImpactSummary(input.latestError, input.interrupts, input.productionStatus, toolSummaries),
    nextSuggestion: buildNextSuggestion(
      turnStatus,
      input.plannerResult,
      input.latestError,
      input.interrupts,
      input.productionStatus,
    ),
  };
}
