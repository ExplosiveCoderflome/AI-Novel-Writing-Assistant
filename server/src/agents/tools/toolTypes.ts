import { z } from "zod";
import type { AgentToolName, ToolExecutionContext } from "../types";

export type ToolRiskLevel = "low" | "medium" | "high";

export interface AgentToolDefinition<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> {
  name: AgentToolName;
  description: string;
  riskLevel: ToolRiskLevel;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute: (context: ToolExecutionContext, input: TInput) => Promise<TOutput>;
}
