import type { AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import { novelProductionToolDefinitions } from "./novelProductionTools";
import { novelReadToolDefinitions } from "./novelReadTools";
import { novelWorkspaceToolDefinitions } from "./novelWorkspaceTools";

export const novelToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  ...novelWorkspaceToolDefinitions,
  ...novelReadToolDefinitions,
  ...novelProductionToolDefinitions,
};
