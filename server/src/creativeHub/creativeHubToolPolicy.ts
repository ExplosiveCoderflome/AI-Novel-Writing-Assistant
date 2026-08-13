import type { AgentToolName, PlannedAction } from "../agents/types";
import { getAgentToolDefinition } from "../agents/toolRegistry";

const CREATIVE_HUB_READ_CATEGORIES = new Set(["read", "inspect"]);

export function isCreativeHubToolAllowed(toolName: AgentToolName): boolean {
  return CREATIVE_HUB_READ_CATEGORIES.has(getAgentToolDefinition(toolName).category);
}

export function filterCreativeHubActions(actions: PlannedAction[]): {
  allowedActions: PlannedAction[];
  blockedTools: AgentToolName[];
} {
  const blockedTools = new Set<AgentToolName>();
  const allowedActions = actions
    .map((action) => ({
      ...action,
      calls: action.calls.filter((call) => {
        if (isCreativeHubToolAllowed(call.tool)) return true;
        blockedTools.add(call.tool);
        return false;
      }),
    }))
    .filter((action) => action.calls.length > 0);

  return { allowedActions, blockedTools: [...blockedTools] };
}

export function getBlockedCreativeHubTools(actions: PlannedAction[]): AgentToolName[] {
  return filterCreativeHubActions(actions).blockedTools;
}
