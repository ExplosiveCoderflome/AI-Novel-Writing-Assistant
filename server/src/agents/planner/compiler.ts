import type { AgentPlan } from "@ai-novel/shared/types/agent";
import type { AgentName, PlannedAction, PlannerInput, StructuredIntent, ToolCall } from "../types";
import { buildIdempotencyKey, slug } from "./utils";
import { resolveWorkflow } from "../../prompting/workflows/workflowRegistry";

const HIGH_RISK_TOOLS = new Set<string>([
  "apply_chapter_patch",
  "queue_pipeline_run",
  "run_director_next_step",
  "run_director_until_gate",
]);

function toolAction(
  agent: AgentName,
  tool: AgentPlan["actions"][number]["tool"],
  reason: string,
  input: Record<string, unknown>,
  keyPrefix: string,
  plannerInput: PlannerInput,
): AgentPlan["actions"][number] {
  return {
    agent,
    tool,
    reason,
    idempotencyKey: buildIdempotencyKey(keyPrefix, plannerInput),
    input,
  };
}

export function compileIntentToPlan(parsed: StructuredIntent, input: PlannerInput): AgentPlan {
  const contextNeeds: AgentPlan["contextNeeds"] = [];

  if (input.contextMode === "novel" && input.novelId) {
    contextNeeds.push({
      key: "novel_context",
      required: true,
      reason: "当前问题绑定小说上下文。",
    });
  } else {
    contextNeeds.push({
      key: "global_context",
      required: true,
      reason: "当前问题使用全局上下文。",
    });
  }

  const resolution = resolveWorkflow(parsed, input);
  const actions = resolution.actions.map((action) => toolAction(
    action.agent,
    action.tool,
    action.reason,
    action.input,
    action.keyPrefix,
    input,
  ));

  const uniqueActions = actions.filter((action, index) => {
    const fingerprint = `${action.tool}:${JSON.stringify(action.input)}`;
    return actions.findIndex((candidate) => `${candidate.tool}:${JSON.stringify(candidate.input)}` === fingerprint) === index;
  });

  return {
    goal: parsed.goal,
    contextNeeds,
    actions: uniqueActions,
    riskLevel: uniqueActions.some((item) => HIGH_RISK_TOOLS.has(item.tool))
      ? "high"
      : uniqueActions.length > 0
        ? "medium"
        : "low",
    requiresApproval: uniqueActions.some((item) => HIGH_RISK_TOOLS.has(item.tool)),
    confidence: parsed.confidence,
  };
}

export function toPlannedActions(plan: AgentPlan): PlannedAction[] {
  const groups = new Map<PlannedAction["agent"], ToolCall[]>();
  for (const action of plan.actions) {
    const call: ToolCall = {
      tool: action.tool as ToolCall["tool"],
      reason: action.reason,
      idempotencyKey: slug(action.idempotencyKey),
      input: action.input,
    };
    const previous = groups.get(action.agent as PlannedAction["agent"]) ?? [];
    previous.push(call);
    groups.set(action.agent as PlannedAction["agent"], previous);
  }
  return Array.from(groups.entries()).map(([agent, calls]) => ({
    agent,
    reasoning: `${agent} 执行 ${calls.length} 个工具步骤。`,
    calls,
  }));
}
