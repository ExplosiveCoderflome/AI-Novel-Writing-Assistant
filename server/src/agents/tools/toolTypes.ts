import { z } from "zod";
import type { DomainAgentName, ResourceScope, ToolCategory } from "@ai-novel/shared/types/agent";
import type { AgentToolName, ToolExecutionContext } from "../types";

export type ToolRiskLevel = "low" | "medium" | "high";

export interface AgentToolDefinition<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> {
  name: AgentToolName;
  title: string;
  description: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  domainAgent: DomainAgentName;
  resourceScopes: ResourceScope[];
  approvalRequired?: boolean;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute: (context: ToolExecutionContext, input: TInput) => Promise<TOutput>;
}
