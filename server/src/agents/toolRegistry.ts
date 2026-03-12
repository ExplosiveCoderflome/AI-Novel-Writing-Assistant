import type { AgentToolName } from "./types";
import { novelToolDefinitions } from "./tools/novelTools";
import { writeToolDefinitions } from "./tools/writeTools";
import type { AgentToolDefinition, ToolRiskLevel } from "./tools/toolTypes";

const definitions = {
  ...novelToolDefinitions,
  ...writeToolDefinitions,
} as Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>;

export type { AgentToolDefinition, ToolRiskLevel } from "./tools/toolTypes";

export function getAgentToolDefinition(toolName: AgentToolName) {
  return definitions[toolName];
}

export function listAgentToolDefinitions(): Array<{
  name: AgentToolName;
  description: string;
  riskLevel: ToolRiskLevel;
}> {
  return Object.values(definitions).map((item) => ({
    name: item.name,
    description: item.description,
    riskLevel: item.riskLevel,
  }));
}
