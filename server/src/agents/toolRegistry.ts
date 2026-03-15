import type { AgentToolName } from "./types";
import { bookAnalysisToolDefinitions } from "./tools/bookAnalysisTools";
import { characterToolDefinitions } from "./tools/characterTools";
import { formulaToolDefinitions } from "./tools/formulaTools";
import { knowledgeToolDefinitions } from "./tools/knowledgeTools";
import { novelToolDefinitions } from "./tools/novelTools";
import { taskToolDefinitions } from "./tools/taskTools";
import { worldToolDefinitions } from "./tools/worldTools";
import { writeToolDefinitions } from "./tools/writeTools";
import type { AgentIntentName } from "./types";
import type { AgentToolDefinition, ToolRiskLevel } from "./tools/toolTypes";

const definitions = {
  ...novelToolDefinitions,
  ...bookAnalysisToolDefinitions,
  ...knowledgeToolDefinitions,
  ...worldToolDefinitions,
  ...formulaToolDefinitions,
  ...characterToolDefinitions,
  ...taskToolDefinitions,
  ...writeToolDefinitions,
} as Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>;

export type { AgentToolDefinition, ToolRiskLevel } from "./tools/toolTypes";

export interface PlannerSemanticDefinition {
  toolName: AgentToolName;
  intent: AgentIntentName;
  title: string;
  description: string;
  aliases: string[];
  phrases: string[];
  requiresNovelContext: boolean;
  whenToUse?: string;
  whenNotToUse?: string;
  inputSchemaSummary: string[];
}

function summarizeSchemaKeys(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }
  const record = schema as {
    shape?: unknown;
    _def?: {
      shape?: unknown;
      schema?: unknown;
      innerType?: unknown;
      type?: string;
    };
  };
  if (record.shape && typeof record.shape === "object" && !Array.isArray(record.shape)) {
    return Object.keys(record.shape as Record<string, unknown>);
  }
  if (record._def?.shape && typeof record._def.shape === "object" && !Array.isArray(record._def.shape)) {
    return Object.keys(record._def.shape as Record<string, unknown>);
  }
  if (record._def?.schema) {
    return summarizeSchemaKeys(record._def.schema);
  }
  if (record._def?.innerType) {
    return summarizeSchemaKeys(record._def.innerType);
  }
  return [];
}

export function getAgentToolDefinition(toolName: AgentToolName) {
  return definitions[toolName];
}

export function listAgentToolDefinitions(): Array<{
  name: AgentToolName;
  title: string;
  description: string;
  category: AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>["category"];
  riskLevel: ToolRiskLevel;
  domainAgent: AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>["domainAgent"];
  resourceScopes: AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>["resourceScopes"];
  approvalRequired: boolean;
  inputSchemaSummary: string[];
}> {
  return Object.values(definitions).map((item) => ({
    name: item.name,
    title: item.title,
    description: item.description,
    category: item.category,
    riskLevel: item.riskLevel,
    domainAgent: item.domainAgent,
    resourceScopes: item.resourceScopes,
    approvalRequired: item.approvalRequired === true,
    inputSchemaSummary: summarizeSchemaKeys(item.inputSchema),
  }));
}

export function listPlannerSemanticDefinitions(): PlannerSemanticDefinition[] {
  return Object.values(definitions)
    .filter((item): item is typeof item & { parserHints: NonNullable<typeof item.parserHints> } => Boolean(item.parserHints?.intent))
    .map((item) => ({
      toolName: item.name,
      intent: item.parserHints.intent as AgentIntentName,
      title: item.title,
      description: item.description,
      aliases: item.parserHints.aliases ?? [],
      phrases: item.parserHints.phrases ?? [],
      requiresNovelContext: item.parserHints.requiresNovelContext ?? false,
      whenToUse: item.parserHints.whenToUse,
      whenNotToUse: item.parserHints.whenNotToUse,
      inputSchemaSummary: summarizeSchemaKeys(item.inputSchema),
    }));
}
